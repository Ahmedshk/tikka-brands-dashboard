/**
 * Helper that pre-computes the chart-bucket keys for current + comparison
 * ranges and issues a single batched rollup probe.
 *
 * Splitting this out of `salesTrendControllerHelpers.ts` keeps the controller
 * helper lean and lets us unit-test the key derivation in isolation.
 */
import { getOrderedBucketsAndLabels } from "../services/square.service.js";
import {
  tryGetOrderTimeSeriesFromRollupsPair,
  type RollupTimeSeriesResult,
} from "../services/integrationRollupRead.service.js";
import type { SalesTrendGranularity } from "./homebaseOrderedBuckets.util.js";
import type { TimeRange } from "./businessHours.util.js";

export async function probePairedSalesTrendRollups(params: {
  locationMongoId: string;
  seriesGranularity: SalesTrendGranularity;
  timezone: string;
  businessStartTime: string;
  periodType: string;
  dataRange: TimeRange;
  comparisonRange: TimeRange | null;
}): Promise<{
  current: RollupTimeSeriesResult;
  comparison: RollupTimeSeriesResult | null;
}> {
  const {
    locationMongoId,
    seriesGranularity,
    timezone,
    businessStartTime,
    periodType,
    dataRange,
    comparisonRange,
  } = params;
  const labelOpts = { periodType, businessStartTime };
  const curBuckets = getOrderedBucketsAndLabels(
    dataRange,
    timezone,
    seriesGranularity,
    labelOpts,
  );
  const cmpBuckets = comparisonRange
    ? getOrderedBucketsAndLabels(
        comparisonRange,
        timezone,
        seriesGranularity,
        labelOpts,
      )
    : null;
  return tryGetOrderTimeSeriesFromRollupsPair(
    locationMongoId,
    seriesGranularity,
    timezone,
    businessStartTime,
    { range: dataRange, keys: curBuckets.keys },
    cmpBuckets && comparisonRange
      ? { range: comparisonRange, keys: cmpBuckets.keys }
      : null,
  );
}
