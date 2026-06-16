import {
  loadSquareOrdersForMongoRange,
  createMongoCatalogBatchRetrieve,
} from "../services/integrationCacheRead.service.js";
import { tryGetNetSalesByCategoryFromDailyRollups } from "../services/integrationRollupRead.service.js";
import { getNetSalesByCategoryInRange, type SquareServiceOptions } from "../services/square.service.js";
import {
  getSalesTrendComparisonRange,
  getSalesTrendPeriodRange,
  toLabelTimeRange,
  type GetSalesTrendComparisonRangeOptions,
  type PeriodType,
} from "./salesTrendDateRange.util.js";
import {
  buildSalesByCategoryResponseData,
  parseSalesByCategoryQuery,
  SALES_LABOR_DETAIL_API_LOG,
} from "./salesLaborControllerHelpers.js";

type SalesByCategoryParams = ReturnType<typeof parseSalesByCategoryQuery>;

function getTimezoneAndBusinessStartTime(location: {
  timezone?: string | null;
  businessStartTime?: string | null;
}): { timezone: string; businessStartTime: string } {
  return {
    timezone: location.timezone?.trim() ?? "UTC",
    businessStartTime: location.businessStartTime?.trim() ?? "00:00",
  };
}

function buildComparisonOptions(args: {
  params: SalesByCategoryParams;
  businessStartTime: string;
}): GetSalesTrendComparisonRangeOptions {
  const { params, businessStartTime } = args;
  return {
    businessStartTime,
    periodType: params.periodType as PeriodType,
    ...(params.comparisonDate === undefined ? {} : { customComparisonDate: params.comparisonDate }),
    ...(params.comparisonStart === undefined ? {} : { customComparisonStart: params.comparisonStart }),
    ...(params.comparisonEnd === undefined ? {} : { customComparisonEnd: params.comparisonEnd }),
  };
}

function buildSalesByCategoryRanges(args: {
  params: SalesByCategoryParams;
  timezone: string;
  businessStartTime: string;
}): {
  period: { startAt: string; endAt: string };
  dataRange: { startAt: string; endAt: string };
  comparisonRange: { startAt: string; endAt: string } | null;
} {
  const { params, timezone, businessStartTime } = args;
  const period = getSalesTrendPeriodRange(
    params.periodType as Parameters<typeof getSalesTrendPeriodRange>[0],
    timezone,
    params.periodStart,
    params.periodEnd,
    businessStartTime,
  );

  const comparison = getSalesTrendComparisonRange(
    params.comparisonType as Parameters<typeof getSalesTrendComparisonRange>[0],
    period.startAt,
    period.endAt,
    timezone,
    {
      ...buildComparisonOptions({ params, businessStartTime }),
      periodDisplayStartAt: period.displayStartAt ?? period.startAt,
      periodDisplayEndAt: period.displayEndAt ?? period.endAt,
    },
  );

  return {
    period,
    dataRange: { startAt: period.startAt, endAt: period.endAt },
    comparisonRange: comparison ? { startAt: comparison.startAt, endAt: comparison.endAt } : null,
  };
}

function buildEmptyCategoryResult(): { categories: Array<{ name: string; netSalesCents: number }>; totalNetSalesCents: number } {
  return { categories: [], totalNetSalesCents: 0 };
}

async function tryGetRollups(args: {
  mongoId: string;
  dataRange: { startAt: string; endAt: string };
  comparisonRange: { startAt: string; endAt: string } | null;
  timezone: string;
  businessStartTime: string;
  categoryCatalogToken: string;
  batchRetrieve: ReturnType<typeof createMongoCatalogBatchRetrieve>;
}): Promise<{
  rollupCurrent: Awaited<ReturnType<typeof tryGetNetSalesByCategoryFromDailyRollups>>;
  rollupComparison: Awaited<ReturnType<typeof tryGetNetSalesByCategoryFromDailyRollups>> | null;
}> {
  const {
    mongoId,
    dataRange,
    comparisonRange,
    timezone,
    businessStartTime,
    batchRetrieve,
    categoryCatalogToken,
  } = args;

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

  return { rollupCurrent, rollupComparison };
}

async function buildSquareOptionsWithOverridesIfNeeded(args: {
  squareOptions: SquareServiceOptions;
  mongoId: string;
  batchRetrieve: ReturnType<typeof createMongoCatalogBatchRetrieve>;
  rollupCurrent: Awaited<ReturnType<typeof tryGetNetSalesByCategoryFromDailyRollups>>;
  rollupComparison: Awaited<ReturnType<typeof tryGetNetSalesByCategoryFromDailyRollups>> | null;
  dataRange: { startAt: string; endAt: string };
  comparisonRange: { startAt: string; endAt: string } | null;
}): Promise<{ currentCatOpts: SquareServiceOptions; comparisonCatOpts: SquareServiceOptions }> {
  const { squareOptions, mongoId, batchRetrieve, rollupCurrent, rollupComparison, dataRange, comparisonRange } = args;

  const needCurrentOrders = rollupCurrent === null;
  const needComparisonOrders = comparisonRange !== null && rollupComparison === null;

  if (!needCurrentOrders && !needComparisonOrders) {
    return { currentCatOpts: squareOptions, comparisonCatOpts: squareOptions };
  }

  const [currentOrders, comparisonOrders] = await Promise.all([
    needCurrentOrders ? loadSquareOrdersForMongoRange(mongoId, dataRange) : Promise.resolve([]),
    needComparisonOrders && comparisonRange
      ? loadSquareOrdersForMongoRange(mongoId, comparisonRange)
      : Promise.resolve([]),
  ]);

  return {
    currentCatOpts: needCurrentOrders
      ? { ...squareOptions, ordersOverride: currentOrders, batchRetrieveCatalogOverride: batchRetrieve }
      : squareOptions,
    comparisonCatOpts: needComparisonOrders
      ? { ...squareOptions, ordersOverride: comparisonOrders, batchRetrieveCatalogOverride: batchRetrieve }
      : squareOptions,
  };
}

async function getNetSalesByCategoryResults(args: {
  squareLocationId: string;
  dataRange: { startAt: string; endAt: string };
  comparisonRange: { startAt: string; endAt: string } | null;
  squareOptions: SquareServiceOptions;
  mongoId: string | null;
  timezone: string;
  businessStartTime: string;
  squareAccessToken: string | null | undefined;
}): Promise<{
  currentResult: { categories: Array<{ name: string; netSalesCents: number }>; totalNetSalesCents: number };
  comparisonResult: { categories: Array<{ name: string; netSalesCents: number }>; totalNetSalesCents: number };
  sources: { currentSource: string; comparisonSource: string };
}> {
  const {
    squareLocationId,
    dataRange,
    comparisonRange,
    squareOptions,
    mongoId,
    timezone,
    businessStartTime,
    squareAccessToken,
  } = args;

  if (!mongoId) {
    const [current, comparison] = await Promise.all([
      getNetSalesByCategoryInRange(squareLocationId, dataRange, squareOptions),
      comparisonRange
        ? getNetSalesByCategoryInRange(squareLocationId, comparisonRange, squareOptions)
        : Promise.resolve(buildEmptyCategoryResult()),
    ]);
    return {
      currentResult: current,
      comparisonResult: comparison,
      sources: {
        currentSource: "mongo_orders_getNetSalesByCategoryInRange",
        comparisonSource: comparisonRange ? "mongo_orders_getNetSalesByCategoryInRange" : "n/a",
      },
    };
  }

  const batchRetrieve = createMongoCatalogBatchRetrieve(mongoId);
  const categoryCatalogToken = squareAccessToken ?? "";

  const { rollupCurrent, rollupComparison } = await tryGetRollups({
    mongoId,
    dataRange,
    comparisonRange,
    timezone,
    businessStartTime,
    batchRetrieve,
    categoryCatalogToken,
  });

  const { currentCatOpts, comparisonCatOpts } = await buildSquareOptionsWithOverridesIfNeeded({
    squareOptions,
    mongoId,
    batchRetrieve,
    rollupCurrent,
    rollupComparison,
    dataRange,
    comparisonRange,
  });

  const currentResult =
    rollupCurrent ?? (await getNetSalesByCategoryInRange(squareLocationId, dataRange, currentCatOpts));

  let comparisonResult = buildEmptyCategoryResult();
  if (comparisonRange) {
    comparisonResult =
      rollupComparison ?? (await getNetSalesByCategoryInRange(squareLocationId, comparisonRange, comparisonCatOpts));
  }

  return {
    currentResult,
    comparisonResult,
    sources: {
      currentSource: rollupCurrent ? "rollups" : "mongo_orders_getNetSalesByCategoryInRange",
      comparisonSource: (() => {
        if (!comparisonRange) return "n/a";
        return rollupComparison ? "rollups" : "mongo_orders_getNetSalesByCategoryInRange";
      })(),
    },
  };
}

export async function getSalesByCategoryDataForLocation(args: {
  params: SalesByCategoryParams;
  location: { _id?: string; timezone?: string | null; businessStartTime?: string | null; squareLocationId?: string | null };
  squareAccessToken?: string | null;
}): Promise<ReturnType<typeof buildSalesByCategoryResponseData>> {
  const { params, location, squareAccessToken } = args;
  const { timezone, businessStartTime } = getTimezoneAndBusinessStartTime(location);
  const { period, dataRange, comparisonRange } = buildSalesByCategoryRanges({
    params,
    timezone,
    businessStartTime,
  });

  const squareLocationId = location.squareLocationId?.trim() ?? "";
  const squareOptions: SquareServiceOptions =
    squareAccessToken != null && String(squareAccessToken).trim() !== ""
      ? { accessToken: String(squareAccessToken).trim() }
      : {};
  const mongoId = location._id?.trim() ?? null;

  let currentResult = buildEmptyCategoryResult();
  let comparisonResult = buildEmptyCategoryResult();

  if (squareLocationId) {
    const results = await getNetSalesByCategoryResults({
      squareLocationId,
      dataRange,
      comparisonRange,
      squareOptions,
      mongoId,
      timezone,
      businessStartTime,
      squareAccessToken,
    });
    currentResult = results.currentResult;
    comparisonResult = results.comparisonResult;
    console.log(SALES_LABOR_DETAIL_API_LOG, "GET /sales-labor/sales-by-category", results.sources);
  }

  const labelPeriod = toLabelTimeRange(period);
  const labelComparison = comparisonRange ? toLabelTimeRange(comparisonRange) : null;

  return buildSalesByCategoryResponseData(
    currentResult,
    comparisonResult,
    labelPeriod.startAt,
    labelPeriod.endAt,
    labelComparison,
  );
}

