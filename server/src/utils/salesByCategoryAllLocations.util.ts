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
  toLabelTimeRange,
  type GetSalesTrendComparisonRangeOptions,
  type PeriodType,
} from './salesTrendDateRange.util.js';
import { buildSalesByCategoryResponseData, parseSalesByCategoryQuery } from './salesLaborControllerHelpers.js';
import { resolveEffectiveAllowedLocationIds } from './locationScope.js';
import { getByIdWithCredentialsCached } from './perRequestCache.util.js';
import {
  getLocationFanoutConcurrency,
  mapWithConcurrency,
} from './boundedConcurrency.util.js';
import {
  summarizeAllLocationsTimings,
  timedPerLocation,
} from './allLocationsTiming.util.js';
import {
  readOrdersEmptyCache,
  writeOrdersEmptyCache,
} from './rollupReadCache.util.js';
import {
  buildPrefetchInputForLocation,
  prefetchAllLocationsDashboardData,
  type AllLocationsPrefetchInput,
} from './allLocationsDashboardPrefetch.util.js';
import { performance } from 'node:perf_hooks';

const CATEGORY_ORDERS_EMPTY_GRANULARITY = 'category';

function categoryRangeKey(range: { startAt: string; endAt: string }): string {
  return `${range.startAt}..${range.endAt}`;
}

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

  const currentEmptyKey = needCurrentOrders
    ? {
        locationMongoId: mongoId,
        granularity: CATEGORY_ORDERS_EMPTY_GRANULARITY,
        rangeKey: categoryRangeKey(dataRange),
      }
    : null;
  const comparisonEmptyKey =
    needComparisonOrders && comparisonRange
      ? {
          locationMongoId: mongoId,
          granularity: CATEGORY_ORDERS_EMPTY_GRANULARITY,
          rangeKey: categoryRangeKey(comparisonRange),
        }
      : null;

  const currentCacheHit = currentEmptyKey
    ? readOrdersEmptyCache(currentEmptyKey)
    : false;
  const comparisonCacheHit = comparisonEmptyKey
    ? readOrdersEmptyCache(comparisonEmptyKey)
    : false;

  const [currentOrders, comparisonOrders] = await Promise.all([
    needCurrentOrders && !currentCacheHit
      ? loadSquareOrdersForMongoRange(mongoId, dataRange)
      : Promise.resolve([]),
    needComparisonOrders && comparisonRange && !comparisonCacheHit
      ? loadSquareOrdersForMongoRange(mongoId, comparisonRange)
      : Promise.resolve([]),
  ]);
  if (needCurrentOrders && !currentCacheHit && currentOrders.length === 0 && currentEmptyKey) {
    writeOrdersEmptyCache(currentEmptyKey);
  }
  if (
    needComparisonOrders &&
    !comparisonCacheHit &&
    comparisonOrders.length === 0 &&
    comparisonEmptyKey
  ) {
    writeOrdersEmptyCache(comparisonEmptyKey);
  }
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
  req: Request;
  locationId: string;
  query: ReturnType<typeof parseSalesByCategoryQuery>;
  locationService: LocationService;
}) {
  const { req, locationId, query, locationService } = params;
  const withCreds = await getByIdWithCredentialsCached(req, locationService, locationId);
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
  comparisonOptions.periodDisplayStartAt = period.displayStartAt ?? period.startAt;
  comparisonOptions.periodDisplayEndAt = period.displayEndAt ?? period.endAt;
  const comparison = getSalesTrendComparisonRange(
    query.comparisonType as Parameters<typeof getSalesTrendComparisonRange>[0],
    period.startAt,
    period.endAt,
    timezone,
    comparisonOptions,
  );
  const dataRange = { startAt: period.startAt, endAt: period.endAt };
  const comparisonRange = comparison ? { startAt: comparison.startAt, endAt: comparison.endAt } : null;
  const labelPeriod = toLabelTimeRange(period);
  const comparisonLabelRange = comparison ? toLabelTimeRange(comparison) : null;

  const squareLocationId = location.squareLocationId?.trim();
  if (!squareLocationId) {
    return {
      periodStartAt: labelPeriod.startAt,
      periodEndAt: labelPeriod.endAt,
      comparisonRange,
      comparisonLabelRange,
      current: { categories: [], totalNetSalesCents: 0 },
      comparison: { categories: [], totalNetSalesCents: 0 },
    };
  }

  const squareOptions: SquareServiceOptions =
    squareAccessToken != null && String(squareAccessToken).trim() !== ""
      ? { accessToken: String(squareAccessToken).trim() }
      : {};
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
    periodStartAt: labelPeriod.startAt,
    periodEndAt: labelPeriod.endAt,
    comparisonRange,
    comparisonLabelRange,
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

  const tHandler = performance.now();
  // Up-front bulk prefetch: collapses N×K per-location Mongo round-trips
  // into 3 bulk queries that prime the process caches the per-location
  // workers below already consult.
  const credsForPrefetch = await Promise.all(
    ids.map((id) => getByIdWithCredentialsCached(req, locationService, id)),
  );
  const prefetchInputs: AllLocationsPrefetchInput[] = [];
  for (let i = 0; i < ids.length; i++) {
    const c = credsForPrefetch[i];
    const locationMongoId = ids[i];
    if (!c || !locationMongoId) continue;
    const tz = c.location.timezone?.trim() ?? 'UTC';
    const bst = c.location.businessStartTime?.trim() ?? '00:00';
    prefetchInputs.push(
      buildPrefetchInputForLocation({
        locationMongoId,
        timezone: tz,
        businessStartTime: bst,
        query: q,
      }),
    );
  }
  if (prefetchInputs.length > 0) {
    await prefetchAllLocationsDashboardData(prefetchInputs);
  }
  const perLocationMs: number[] = [];
  const perLoc = await mapWithConcurrency(
    ids,
    getLocationFanoutConcurrency(),
    async (id) => {
      const { value, ms } = await timedPerLocation(() =>
        fetchSalesByCategoryForLocation({ req, locationId: id, query: q, locationService }),
      );
      perLocationMs.push(ms);
      return value;
    },
  );

  const logTimingDone = (count: number): void => {
    summarizeAllLocationsTimings({
      route: 'GET /sales-labor/sales-by-category',
      locationCount: count,
      totalMs: Math.round(performance.now() - tHandler),
      perLocationMs,
    });
  };

  const usable = perLoc.filter((x): x is NonNullable<typeof x> => x != null);
  if (usable.length === 0) {
    logTimingDone(0);
    return emptyResponse();
  }

  const first = usable[0];
  if (!first) {
    logTimingDone(usable.length);
    return emptyResponse();
  }
  const mergedCurrent = mergeCategoryResults(usable.map((u) => u.current));
  const mergedComparison = mergeCategoryResults(usable.map((u) => u.comparison));

  const out = buildSalesByCategoryResponseData(
    mergedCurrent,
    mergedComparison,
    first.periodStartAt,
    first.periodEndAt,
    first.comparisonLabelRange ?? first.comparisonRange,
  );
  logTimingDone(usable.length);
  return out;
}

