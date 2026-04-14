import type { Request } from 'express';
import type { LocationService } from '../services/location.service.js';
import { tryGetNetSalesByCategoryFromDailyRollups } from '../services/integrationRollupRead.service.js';
import {
  createMongoCatalogBatchRetrieve,
  loadSquareOrdersForMongoRange,
} from '../services/integrationCacheRead.service.js';
import { getNetSalesByCategoryInRange, type SquareServiceOptions } from '../services/square.service.js';
import {
  getSalesTrendComparisonRange,
  getSalesTrendPeriodRange,
  type GetSalesTrendComparisonRangeOptions,
  type PeriodType,
} from './salesTrendDateRange.util.js';
import { buildSalesByCategoryResponseData, parseSalesByCategoryQuery } from './salesLaborControllerHelpers.js';
import { resolveEffectiveAllowedLocationIds } from './locationScope.js';

type CategoryResult = { categories: Array<{ name: string; netSalesCents: number }>; totalNetSalesCents: number };

function mergeCategoryResults(results: CategoryResult[]): CategoryResult {
  const byName = new Map<string, number>();
  for (const r of results) {
    for (const c of r.categories) {
      const key = c.name;
      byName.set(key, (byName.get(key) ?? 0) + (c.netSalesCents ?? 0));
    }
  }
  const categories = Array.from(byName.entries())
    .map(([name, netSalesCents]) => ({ name, netSalesCents }))
    .sort((a, b) => b.netSalesCents - a.netSalesCents);
  const totalNetSalesCents = categories.reduce((sum, c) => sum + c.netSalesCents, 0);
  return { categories, totalNetSalesCents };
}

function emptyResponse() {
  return buildSalesByCategoryResponseData(
    { categories: [], totalNetSalesCents: 0 },
    { categories: [], totalNetSalesCents: 0 },
    '',
    '',
    null,
  );
}

async function tryLoadRollupPair(params: {
  mongoId: string;
  dataRange: { startAt: string; endAt: string };
  comparisonRange: { startAt: string; endAt: string } | null;
  timezone: string;
  businessStartTime: string;
  categoryCatalogToken: string;
}): Promise<{ rollupCurrent: CategoryResult | null; rollupComparison: CategoryResult | null; batchRetrieve: ReturnType<typeof createMongoCatalogBatchRetrieve> }> {
  const {
    mongoId,
    dataRange,
    comparisonRange,
    timezone,
    businessStartTime,
    categoryCatalogToken,
  } = params;
  const batchRetrieve = createMongoCatalogBatchRetrieve(mongoId);
  const [rollupCurrent, rollupComparison] = await Promise.all([
    tryGetNetSalesByCategoryFromDailyRollups(
      mongoId,
      dataRange,
      timezone,
      businessStartTime,
      batchRetrieve,
      categoryCatalogToken,
    ),
    comparisonRange
      ? tryGetNetSalesByCategoryFromDailyRollups(
          mongoId,
          comparisonRange,
          timezone,
          businessStartTime,
          batchRetrieve,
          categoryCatalogToken,
        )
      : Promise.resolve(null),
  ]);
  return { rollupCurrent, rollupComparison, batchRetrieve };
}

async function maybeBuildCategoryOptions(params: {
  useCategoryCache: boolean;
  mongoId: string | undefined;
  batchRetrieve: ReturnType<typeof createMongoCatalogBatchRetrieve> | null;
  rollupCurrent: CategoryResult | null;
  rollupComparison: CategoryResult | null;
  squareOptions: SquareServiceOptions;
  dataRange: { startAt: string; endAt: string };
  comparisonRange: { startAt: string; endAt: string } | null;
}): Promise<{ currentCatOpts: SquareServiceOptions; comparisonCatOpts: SquareServiceOptions }> {
  const {
    useCategoryCache,
    mongoId,
    batchRetrieve,
    rollupCurrent,
    rollupComparison,
    squareOptions,
    dataRange,
    comparisonRange,
  } = params;

  let currentCatOpts: SquareServiceOptions = squareOptions;
  let comparisonCatOpts: SquareServiceOptions = squareOptions;

  if (!useCategoryCache || !mongoId || !batchRetrieve) return { currentCatOpts, comparisonCatOpts };

  const needCurrentOrders = rollupCurrent == null;
  const needComparisonOrders = comparisonRange != null && rollupComparison == null;
  if (!needCurrentOrders && !needComparisonOrders) return { currentCatOpts, comparisonCatOpts };

  const [currentOrders, comparisonOrders] = await Promise.all([
    needCurrentOrders ? loadSquareOrdersForMongoRange(mongoId, dataRange) : Promise.resolve([]),
    needComparisonOrders && comparisonRange ? loadSquareOrdersForMongoRange(mongoId, comparisonRange) : Promise.resolve([]),
  ]);
  if (needCurrentOrders) {
    currentCatOpts = {
      ...squareOptions,
      ordersOverride: currentOrders,
      batchRetrieveCatalogOverride: batchRetrieve,
    };
  }
  if (needComparisonOrders) {
    comparisonCatOpts = {
      ...squareOptions,
      ordersOverride: comparisonOrders,
      batchRetrieveCatalogOverride: batchRetrieve,
    };
  }
  return { currentCatOpts, comparisonCatOpts };
}

async function fetchSalesByCategoryForLocation(params: {
  locationId: string;
  query: ReturnType<typeof parseSalesByCategoryQuery>;
  locationService: LocationService;
}) {
  const { locationId, query, locationService } = params;
  const withCreds = await locationService.getByIdWithCredentials(locationId);
  if (!withCreds) return null;
  const { location, squareAccessToken } = withCreds;
  const timezone = location.timezone?.trim() ?? 'UTC';
  const businessStartTime = location.businessStartTime?.trim() ?? '00:00';
  const period = getSalesTrendPeriodRange(
    query.periodType as Parameters<typeof getSalesTrendPeriodRange>[0],
    timezone,
    query.periodStart,
    query.periodEnd,
    businessStartTime,
  );
  const comparisonOptions: GetSalesTrendComparisonRangeOptions = { businessStartTime };
  if (query.comparisonDate) comparisonOptions.customComparisonDate = query.comparisonDate;
  if (query.comparisonStart) comparisonOptions.customComparisonStart = query.comparisonStart;
  if (query.comparisonEnd) comparisonOptions.customComparisonEnd = query.comparisonEnd;
  comparisonOptions.periodType = query.periodType as PeriodType;
  const comparison = getSalesTrendComparisonRange(
    query.comparisonType as Parameters<typeof getSalesTrendComparisonRange>[0],
    period.startAt,
    period.endAt,
    timezone,
    comparisonOptions,
  );
  const dataRange = { startAt: period.startAt, endAt: period.endAt };
  const comparisonRange = comparison ? { startAt: comparison.startAt, endAt: comparison.endAt } : null;

  const squareLocationId = location.squareLocationId?.trim();
  if (!squareLocationId) {
    return {
      periodStartAt: period.startAt,
      periodEndAt: period.endAt,
      comparisonRange,
      current: { categories: [], totalNetSalesCents: 0 },
      comparison: { categories: [], totalNetSalesCents: 0 },
    };
  }

  const squareOptions = { accessToken: squareAccessToken ?? undefined };
  const mongoId = location._id?.trim();
  const useCategoryCache = Boolean(mongoId);

  const categoryCatalogToken = squareAccessToken ?? '';

  const { rollupCurrent, rollupComparison, batchRetrieve } =
    useCategoryCache && mongoId
      ? await tryLoadRollupPair({
          mongoId,
          dataRange,
          comparisonRange,
          timezone,
          businessStartTime,
          categoryCatalogToken,
        })
      : { rollupCurrent: null, rollupComparison: null, batchRetrieve: null };

  const { currentCatOpts, comparisonCatOpts } = await maybeBuildCategoryOptions({
    useCategoryCache,
    mongoId,
    batchRetrieve,
    rollupCurrent,
    rollupComparison,
    squareOptions,
    dataRange,
    comparisonRange,
  });

  const [current, comp] = await Promise.all([
    rollupCurrent ?? getNetSalesByCategoryInRange(squareLocationId, dataRange, currentCatOpts),
    comparisonRange
      ? rollupComparison ?? getNetSalesByCategoryInRange(squareLocationId, comparisonRange, comparisonCatOpts)
      : Promise.resolve({ categories: [], totalNetSalesCents: 0 }),
  ]);

  return {
    periodStartAt: period.startAt,
    periodEndAt: period.endAt,
    comparisonRange,
    current,
    comparison: comp,
  };
}

export async function buildSalesByCategoryAllLocations(params: {
  req: Request;
  locationService: LocationService;
}): Promise<ReturnType<typeof buildSalesByCategoryResponseData>> {
  const { req, locationService } = params;
  const q = parseSalesByCategoryQuery(req.query as Record<string, unknown>);
  const ids = await resolveEffectiveAllowedLocationIds(req);
  if (ids.length === 0) {
    return emptyResponse();
  }

  const perLoc = await Promise.all(
    ids.map((id) => fetchSalesByCategoryForLocation({ locationId: id, query: q, locationService })),
  );

  const usable = perLoc.filter((x): x is NonNullable<typeof x> => x != null);
  if (usable.length === 0) {
    return emptyResponse();
  }

  const first = usable[0];
  if (!first) return emptyResponse();
  const mergedCurrent = mergeCategoryResults(usable.map((u) => u.current));
  const mergedComparison = mergeCategoryResults(usable.map((u) => u.comparison));

  return buildSalesByCategoryResponseData(
    mergedCurrent,
    mergedComparison,
    first.periodStartAt,
    first.periodEndAt,
    first.comparisonRange,
  );
}

