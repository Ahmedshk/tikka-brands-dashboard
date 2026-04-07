import {
  getSquareOrderCreatedAtMsFromRaw,
  isRawSquareOrderExcludedFromDashboardDisplay,
} from "./squareOrderCacheHelpers.js";

export function getSquareOrderMongoIndexFields(raw: Record<string, unknown>): {
  squareCreatedAt: Date | null;
  excludedFromDashboard: boolean;
} {
  const ms = getSquareOrderCreatedAtMsFromRaw(raw);
  return {
    squareCreatedAt: ms != null ? new Date(ms) : null,
    excludedFromDashboard: isRawSquareOrderExcludedFromDashboardDisplay(raw),
  };
}
