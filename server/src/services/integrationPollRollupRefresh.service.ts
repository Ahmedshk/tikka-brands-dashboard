import {
  businessDateKeyForInstant,
  businessDateKeysIntersectingUtcRange,
} from "../utils/businessDayUtcRange.util.js";
import { homebaseSlidingWindowIso } from "./integrationSyncRunner.service.js";
import {
  buildHomebaseRollupForDay,
  buildMarketManRollupForDay,
  buildSquareOrderRollupForDay,
  buildSquarePaymentRollupForDay,
} from "./dailyRollupBuilder.service.js";
import { rebuildSquareOrderDerivedRollupsForBusinessDay } from "./squareOrderMultiGranularityRollup.service.js";
import { buildHomebaseTimecardHourlyRollupsForDay } from "./homebaseTimecardHourlyRollup.service.js";
import {
  loadLocationsForRollupScript,
  distinctBuyerGuidsForMarketManRollup,
  type LocationRollupContext,
} from "../utils/rollupLocations.util.js";
import { logger } from "../utils/logger.util.js";
import type { IntegrationSyncResource } from "../models/integrationSyncLog.model.js";
import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";

function filterLocationsByIds(
  locs: LocationRollupContext[],
  locationIds?: string[],
): LocationRollupContext[] {
  if (!locationIds?.length) return locs;
  const allow = new Set(locationIds.map(String));
  return locs.filter((l) => allow.has(String(l._id)));
}

async function safeBuildHomebase(
  locationMongoId: string,
  key: string,
  timezone: string,
  businessStartTime: string,
): Promise<void> {
  try {
    await buildHomebaseRollupForDay(
      locationMongoId,
      key,
      timezone,
      businessStartTime,
    );
    // Hourly rollup mirrors the Square pattern (safeBuildSquareOrder builds
    // daily + derived). Failure is non-fatal: the read path falls back to
    // scanning timecards if the hourly rollup is missing or incomplete.
    await buildHomebaseTimecardHourlyRollupsForDay(
      locationMongoId,
      key,
      timezone,
      businessStartTime,
    );
  } catch (err) {
    logger.error("refreshHomebaseRollupForDay failed", {
      err,
      locationMongoId,
      key,
    });
  }
}

async function safeBuildMarketMan(
  locationMongoId: string,
  buyerGuid: string,
  apiKind: MarketManOrderApiKind,
  key: string,
  timezone: string,
  businessStartTime: string,
): Promise<void> {
  try {
    await buildMarketManRollupForDay(
      locationMongoId,
      buyerGuid,
      apiKind,
      key,
      timezone,
      businessStartTime,
    );
  } catch (err) {
    logger.error("refreshMarketManRollupForDay failed", {
      err,
      locationMongoId,
      buyerGuid,
      apiKind,
      key,
    });
  }
}

async function safeBuildSquareOrder(
  locationMongoId: string,
  key: string,
  timezone: string,
  businessStartTime: string,
): Promise<void> {
  try {
    await buildSquareOrderRollupForDay(
      locationMongoId,
      key,
      timezone,
      businessStartTime,
    );
    await rebuildSquareOrderDerivedRollupsForBusinessDay(
      locationMongoId,
      key,
      timezone,
      businessStartTime,
    );
  } catch (err) {
    logger.error("refreshSquareOrderRollupForDay failed", {
      err,
      locationMongoId,
      key,
    });
  }
}

async function safeBuildSquarePayment(
  locationMongoId: string,
  key: string,
  timezone: string,
  businessStartTime: string,
): Promise<void> {
  try {
    await buildSquarePaymentRollupForDay(
      locationMongoId,
      key,
      timezone,
      businessStartTime,
    );
  } catch (err) {
    logger.error("refreshSquarePaymentRollupForDay failed", {
      err,
      locationMongoId,
      key,
    });
  }
}

export async function refreshHomebaseRollupsForUtcRange(params: {
  startAtIso: string;
  endAtIso: string;
  locationIds?: string[];
}): Promise<void> {
  const locs = filterLocationsByIds(
    await loadLocationsForRollupScript(),
    params.locationIds,
  );
  for (const loc of locs) {
    const keys = businessDateKeysIntersectingUtcRange(
      params.startAtIso,
      params.endAtIso,
      loc.timezone,
      loc.businessStartTime,
    );
    const id = String(loc._id);
    for (const key of keys) {
      await safeBuildHomebase(id, key, loc.timezone, loc.businessStartTime);
    }
  }
}

export async function refreshMarketManRollupsForUtcRange(params: {
  startAtIso: string;
  endAtIso: string;
  locationIds?: string[];
  apiKinds: MarketManOrderApiKind[];
}): Promise<void> {
  const locs = filterLocationsByIds(
    await loadLocationsForRollupScript(),
    params.locationIds,
  );
  for (const loc of locs) {
    const keys = businessDateKeysIntersectingUtcRange(
      params.startAtIso,
      params.endAtIso,
      loc.timezone,
      loc.businessStartTime,
    );
    const id = String(loc._id);
    const buyers = await distinctBuyerGuidsForMarketManRollup(
      id,
      loc.marketManBuyerGuid,
    );
    if (buyers.length === 0) continue;
    for (const key of keys) {
      for (const bg of buyers) {
        for (const apiKind of params.apiKinds) {
          await safeBuildMarketMan(
            id,
            bg,
            apiKind,
            key,
            loc.timezone,
            loc.businessStartTime,
          );
        }
      }
    }
  }
}

export async function refreshSquareOrderRollupsForUtcRange(params: {
  startAtIso: string;
  endAtIso: string;
  locationIds?: string[];
}): Promise<void> {
  const locs = filterLocationsByIds(
    await loadLocationsForRollupScript(),
    params.locationIds,
  );
  for (const loc of locs) {
    const keys = businessDateKeysIntersectingUtcRange(
      params.startAtIso,
      params.endAtIso,
      loc.timezone,
      loc.businessStartTime,
    );
    const id = String(loc._id);
    for (const key of keys) {
      await safeBuildSquareOrder(id, key, loc.timezone, loc.businessStartTime);
    }
  }
}

export async function refreshSquarePaymentRollupsForUtcRange(params: {
  startAtIso: string;
  endAtIso: string;
  locationIds?: string[];
}): Promise<void> {
  const locs = filterLocationsByIds(
    await loadLocationsForRollupScript(),
    params.locationIds,
  );
  for (const loc of locs) {
    const keys = businessDateKeysIntersectingUtcRange(
      params.startAtIso,
      params.endAtIso,
      loc.timezone,
      loc.businessStartTime,
    );
    const id = String(loc._id);
    for (const key of keys) {
      await safeBuildSquarePayment(
        id,
        key,
        loc.timezone,
        loc.businessStartTime,
      );
    }
  }
}

export async function refreshHomebaseRollupsAfterPoll(): Promise<void> {
  const window = homebaseSlidingWindowIso();
  await refreshHomebaseRollupsForUtcRange({
    startAtIso: window.startAt,
    endAtIso: window.endAt,
  });
}

/**
 * Refresh Square order rollups for the in-progress and most recent business
 * day per location. Mirrors {@link refreshMarketManRollupsAfterPoll} but covers
 * "today + yesterday" so that a missed/delayed webhook for an order placed near
 * the business-day boundary still produces a current daily rollup within one
 * poll cycle.
 *
 * Scope reasoning:
 *   - Square orders themselves arrive via webhooks (not a poll-time sync), so
 *     we don't need a full sliding window — only to rebuild rollups whose
 *     underlying orders may have changed since the last build.
 *   - Two business-day keys × N locations is bounded work (~200ms per
 *     buildSquareOrderRollupForDay × ~9 locations × 2 days ≈ 3-4s serial),
 *     keeping the poll handler well under the 15-min cadence.
 *   - Each call rebuilds the daily document AND the derived hourly/period
 *     rollups via {@link safeBuildSquareOrder}, closing the read-path gap
 *     where "today" has no daily rollup yet (the dashboard's hot path).
 */
export async function refreshSquareOrderRollupsAfterPoll(): Promise<void> {
  const locs = await loadLocationsForRollupScript();
  const now = new Date();
  for (const loc of locs) {
    const id = String(loc._id);
    const today = businessDateKeyForInstant(
      now,
      loc.timezone,
      loc.businessStartTime,
    );
    // Yesterday's key: shift the reference instant back 24h. Safe across DST
    // because businessDateKeyForInstant resolves the calendar key in TZ.
    const yesterdayInstant = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterday = businessDateKeyForInstant(
      yesterdayInstant,
      loc.timezone,
      loc.businessStartTime,
    );
    const keys = today === yesterday ? [today] : [yesterday, today];
    for (const key of keys) {
      await safeBuildSquareOrder(id, key, loc.timezone, loc.businessStartTime);
    }
  }
}

export async function refreshMarketManRollupsAfterPoll(): Promise<void> {
  const locs = await loadLocationsForRollupScript();
  const now = new Date();
  for (const loc of locs) {
    const businessDateKey = businessDateKeyForInstant(
      now,
      loc.timezone,
      loc.businessStartTime,
    );
    const id = String(loc._id);
    const buyers = await distinctBuyerGuidsForMarketManRollup(
      id,
      loc.marketManBuyerGuid,
    );
    for (const bg of buyers) {
      await safeBuildMarketMan(
        id,
        bg,
        "sent",
        businessDateKey,
        loc.timezone,
        loc.businessStartTime,
      );
      await safeBuildMarketMan(
        id,
        bg,
        "delivery",
        businessDateKey,
        loc.timezone,
        loc.businessStartTime,
      );
    }
  }
}

export async function refreshDailyRollupsAfterRunAllToday(): Promise<void> {
  const locs = await loadLocationsForRollupScript();
  const now = new Date();
  for (const loc of locs) {
    const key = businessDateKeyForInstant(
      now,
      loc.timezone,
      loc.businessStartTime,
    );
    const id = String(loc._id);
    await safeBuildSquareOrder(id, key, loc.timezone, loc.businessStartTime);
    await safeBuildSquarePayment(id, key, loc.timezone, loc.businessStartTime);
    await safeBuildHomebase(id, key, loc.timezone, loc.businessStartTime);
    const buyers = await distinctBuyerGuidsForMarketManRollup(
      id,
      loc.marketManBuyerGuid,
    );
    for (const bg of buyers) {
      await safeBuildMarketMan(
        id,
        bg,
        "sent",
        key,
        loc.timezone,
        loc.businessStartTime,
      );
      await safeBuildMarketMan(
        id,
        bg,
        "delivery",
        key,
        loc.timezone,
        loc.businessStartTime,
      );
    }
  }
}

export async function refreshRollupsAfterManualSyncSingleResource(
  resource: IntegrationSyncResource,
  options: {
    startTrim: string;
    endTrim: string;
    locationIds?: string[];
  },
): Promise<void> {
  const { startTrim, endTrim, locationIds } = options;

  if (
    resource === "square_catalog" ||
    resource === "square_team_members" ||
    resource === "marketman_valid_count_dates"
  ) {
    return;
  }

  if (!startTrim || !endTrim) {
    return;
  }

  const startIso = new Date(startTrim).toISOString();
  const endIso = new Date(endTrim).toISOString();

  const locFilter =
    locationIds != null && locationIds.length > 0
      ? { locationIds }
      : ({} as { locationIds?: string[] });

  switch (resource) {
    case "homebase_timecards":
      await refreshHomebaseRollupsForUtcRange({
        startAtIso: startIso,
        endAtIso: endIso,
        ...locFilter,
      });
      break;
    case "marketman_orders_both":
      await refreshMarketManRollupsForUtcRange({
        startAtIso: startIso,
        endAtIso: endIso,
        ...locFilter,
        apiKinds: ["sent", "delivery"],
      });
      break;
    case "marketman_orders_sent":
      await refreshMarketManRollupsForUtcRange({
        startAtIso: startIso,
        endAtIso: endIso,
        ...locFilter,
        apiKinds: ["sent"],
      });
      break;
    case "marketman_orders_delivery":
      await refreshMarketManRollupsForUtcRange({
        startAtIso: startIso,
        endAtIso: endIso,
        ...locFilter,
        apiKinds: ["delivery"],
      });
      break;
    case "square_orders":
      await refreshSquareOrderRollupsForUtcRange({
        startAtIso: startIso,
        endAtIso: endIso,
        ...locFilter,
      });
      break;
    case "square_payments":
      await refreshSquarePaymentRollupsForUtcRange({
        startAtIso: startIso,
        endAtIso: endIso,
        ...locFilter,
      });
      break;
    default:
      break;
  }
}
