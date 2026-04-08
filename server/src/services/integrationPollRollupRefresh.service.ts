import { businessDateKeyForInstant } from "../utils/businessDayUtcRange.util.js";
import { homebaseSlidingWindowIso } from "./integrationSyncRunner.service.js";
import {
  buildHomebaseRollupForDay,
  buildMarketManRollupForDay,
  buildSquareOrderRollupForDay,
  buildSquarePaymentRollupForDay,
} from "./dailyRollupBuilder.service.js";
import { rebuildSquareOrderDerivedRollupsForBusinessDay } from "./squareOrderMultiGranularityRollup.service.js";
import {
  loadLocationsForRollupScript,
  distinctBuyerGuidsForMarketManRollup,
  type LocationRollupContext,
} from "../utils/rollupLocations.util.js";
import { businessDateKeysIntersectingUtcRange } from "../utils/businessDayUtcRange.util.js";
import { logger } from "../utils/logger.util.js";
import type { IntegrationSyncResource } from "../models/integrationSyncLog.model.js";
import type { MarketManOrderApiKind } from "../models/marketmanOrderCache.model.js";

function filterLocationsByIds(
  locs: LocationRollupContext[],
  locationIds?: string[],
): LocationRollupContext[] {
  if (!locationIds?.length) return locs;
  const allow = new Set(locationIds.map((x) => String(x)));
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
      if (!startTrim || !endTrim) return;
      await refreshSquareOrderRollupsForUtcRange({
        startAtIso: startIso,
        endAtIso: endIso,
        ...locFilter,
      });
      break;
    case "square_payments":
      if (!startTrim || !endTrim) return;
      await refreshSquarePaymentRollupsForUtcRange({
        startAtIso: startIso,
        endAtIso: endIso,
        ...locFilter,
      });
      break;
    case "square_catalog":
    case "square_team_members":
    case "marketman_valid_count_dates":
      break;
    default:
      break;
  }
}
