import mongoose from "mongoose";
import type {
  IAlertNotificationSettings,
  IAlertRoleBinding,
} from "../types/alertNotification.types.js";
import type { NotificationType } from "../types/notification.types.js";
import { getInventoryItems } from "../services/marketman.service.js";
import { LowInventoryAlertStateModel } from "../models/lowInventoryAlertState.model.js";
import { intervalMinutesForSchedule, shouldRunAlertScheduleTick } from "./alertScheduleRun.util.js";
import { buildFireTimeKey } from "./alertFireTimeKey.util.js";
import { listOverdueDeliveryOrdersNotReceived } from "./alertEvaluationOverdueDelivery.util.js";
import { getTodayInTimezoneAt } from "./timezone.util.js";
import { logger } from "./logger.util.js";

export type InventoryAlertDispatchPayload = {
  settings: IAlertNotificationSettings;
  locationId: string;
  storeName: string;
  category: IAlertRoleBinding["category"];
  roleBindingSubcategory: string;
  type: NotificationType;
  title: string;
  message: string;
  alertKind: string;
  severity: "warning" | "critical";
  fireKey: string;
  data: Record<string, unknown>;
};

type LowInventoryMarketManRow = {
  itemId: string;
  name: string;
  categoryName: string;
  uomName: string;
  onHand: number;
  minOnHand: number;
};

type LowInventoryStateLean = {
  itemId: string;
  isLow?: boolean;
  lastAlertedAt?: Date | string | null;
  episodeStartedAt?: Date | string | null;
};

function formatLowInventoryAlertMessage(
  storeLabel: string,
  row: Pick<LowInventoryMarketManRow, "name" | "onHand" | "minOnHand" | "uomName">,
): string {
  const u = row.uomName.trim();
  const qty =
    u.length > 0
      ? ` (${row.onHand} ${u} < ${row.minOnHand} ${u})`
      : ` (${row.onHand} < ${row.minOnHand})`;
  return `${storeLabel}: ${row.name} is below minimum on hand${qty}.`;
}

function collectLowInventoryRowsFromMarketManItems(
  items: Awaited<ReturnType<typeof getInventoryItems>>,
): LowInventoryMarketManRow[] {
  const low: LowInventoryMarketManRow[] = [];
  for (const it of items) {
    const min = it.MinOnHand;
    if (min == null || !Number.isFinite(min)) continue;
    const onHand = it.OnHand;
    if (onHand == null || !Number.isFinite(onHand)) continue;
    if (onHand >= min) continue;
    const itemId = String(it.ID ?? "").trim();
    if (!itemId) continue;
    const categoryName = String(it.CategoryName ?? "").trim();
    const uomName = String(it.UOMName ?? "").trim();
    low.push({
      itemId,
      name: String(it.Name ?? "").trim() || "Item",
      categoryName,
      uomName,
      onHand,
      minOnHand: min,
    });
  }
  return low;
}

function computeLowInventorySendPlan(
  cadence: string,
  prev: LowInventoryStateLean | undefined,
  dayKey: string,
  tickFireKey: string,
  tickAnchorMs: number,
  itemId: string,
): {
  shouldSend: boolean;
  fireKey: string;
  nextEpisodeStartedAt: Date | null;
  nextLastAlertedAt: Date | null;
} {
  if (cadence === "every_run") {
    return {
      shouldSend: true,
      fireKey: `${tickFireKey}|item:${itemId}`,
      nextEpisodeStartedAt: null,
      nextLastAlertedAt: null,
    };
  }
  if (cadence === "once_per_day") {
    return {
      shouldSend: true,
      fireKey: `${dayKey}|item:${itemId}`,
      nextEpisodeStartedAt: null,
      nextLastAlertedAt: null,
    };
  }
  const wasLow = Boolean(prev?.isLow);
  const alreadyAlerted = prev?.lastAlertedAt != null;
  if (!wasLow) {
    const now = new Date(tickAnchorMs);
    return {
      shouldSend: true,
      fireKey: `${now.toISOString()}|item:${itemId}`,
      nextEpisodeStartedAt: now,
      nextLastAlertedAt: now,
    };
  }
  if (!alreadyAlerted) {
    const nextEpisodeStartedAt = prev?.episodeStartedAt
      ? new Date(prev.episodeStartedAt)
      : new Date(tickAnchorMs);
    return {
      shouldSend: true,
      fireKey: `${nextEpisodeStartedAt.toISOString()}|item:${itemId}`,
      nextEpisodeStartedAt,
      nextLastAlertedAt: new Date(tickAnchorMs),
    };
  }
  return {
    shouldSend: false,
    fireKey: "",
    nextEpisodeStartedAt: null,
    nextLastAlertedAt: null,
  };
}

async function resetLowInventoryStatesWhenNoLowItems(locationId: string): Promise<void> {
  const lowOid = new mongoose.Types.ObjectId(locationId);
  const lowStates = await LowInventoryAlertStateModel.find({
    locationId: lowOid,
    isLow: true,
  })
    .lean()
    .exec();
  if (lowStates.length === 0) {
    return;
  }
  await LowInventoryAlertStateModel.updateMany(
    { locationId: lowOid, isLow: true },
    { $set: { isLow: false, lastAlertedAt: null } },
  ).exec();
}

async function resolveStaleLowInventoryStates(
  lowOid: mongoose.Types.ObjectId,
  stateDocs: LowInventoryStateLean[],
  lowSet: Set<string>,
): Promise<void> {
  const resolveOps: Array<Promise<unknown>> = [];
  for (const s of stateDocs) {
    if (!s.isLow) continue;
    if (lowSet.has(String(s.itemId))) continue;
    resolveOps.push(
      LowInventoryAlertStateModel.updateOne(
        { locationId: lowOid, itemId: String(s.itemId) },
        { $set: { isLow: false, lastAlertedAt: null } },
      ).exec(),
    );
  }
  if (resolveOps.length > 0) {
    await Promise.all(resolveOps);
  }
}

async function appendDeliveryOverduePayloadIfDue(
  out: InventoryAlertDispatchPayload[],
  params: {
    settings: IAlertNotificationSettings;
    inventory: IAlertNotificationSettings["inventorySupplyChain"];
    locationId: string;
    buyerGuid: string;
    timezone: string;
    tickAnchorMs: number;
    storeLabel: string;
  },
): Promise<void> {
  if (!params.inventory.deliveryOverdueNotReceived) {
    return;
  }
  const run = params.inventory.run;
  if (!shouldRunAlertScheduleTick(run, params.timezone, params.tickAnchorMs)) {
    return;
  }
  const overdueOrders = await listOverdueDeliveryOrdersNotReceived(
    params.locationId,
    params.buyerGuid,
    params.timezone,
  );
  if (overdueOrders.length === 0) {
    return;
  }
  const im = intervalMinutesForSchedule(run);
  const fireKey = buildFireTimeKey(run, params.timezone, im, params.tickAnchorMs);
  const n = overdueOrders.length;
  out.push({
    settings: params.settings,
    locationId: params.locationId,
    storeName: params.storeLabel,
    category: "inventory_supply_chain",
    roleBindingSubcategory: "delivery_overdue",
    type: "alert_inventory_delivery_overdue",
    title: "Delivery overdue",
    message: `${params.storeLabel}: ${n} order(s) have a past delivery date and are not marked received.`,
    alertKind: "delivery_overdue",
    severity: "critical",
    fireKey,
    data: {
      sourceKey: "delivery_overdue",
      count: n,
      overdueOrderRows: overdueOrders,
    },
  });
}

async function appendLowInventoryPayloadsIfDue(
  out: InventoryAlertDispatchPayload[],
  params: {
    settings: IAlertNotificationSettings;
    inventory: IAlertNotificationSettings["inventorySupplyChain"];
    locationId: string;
    buyerGuid: string;
    timezone: string;
    tickAnchorMs: number;
    storeLabel: string;
    locStoreNameForDb: string;
  },
): Promise<void> {
  if (!params.inventory.lowInventoryEnabled) {
    return;
  }
  const run = params.inventory.lowInventoryRun;
  if (!shouldRunAlertScheduleTick(run, params.timezone, params.tickAnchorMs)) {
    return;
  }

  let items: Awaited<ReturnType<typeof getInventoryItems>>;
  try {
    items = await getInventoryItems(params.buyerGuid);
  } catch (err) {
    logger.warn("[Alerts] MarketMan inventory items fetch failed", {
      locationId: params.locationId,
      err,
    });
    return;
  }

  const low = collectLowInventoryRowsFromMarketManItems(items);
  const lowOid = new mongoose.Types.ObjectId(params.locationId);

  if (low.length === 0) {
    await resetLowInventoryStatesWhenNoLowItems(params.locationId);
    return;
  }

  const cadence = params.inventory.lowInventoryCadence;
  const lowIds = low.map((x) => x.itemId);
  const stateDocs = (await LowInventoryAlertStateModel.find({
    locationId: lowOid,
    $or: [{ isLow: true }, { itemId: { $in: lowIds } }],
  })
    .lean()
    .exec()) as LowInventoryStateLean[];

  const stateByItemId = new Map(stateDocs.map((d) => [String(d.itemId), d]));
  const lowSet = new Set(lowIds);

  await resolveStaleLowInventoryStates(lowOid, stateDocs, lowSet);

  const dayKey = getTodayInTimezoneAt(params.timezone, params.tickAnchorMs);
  const im = intervalMinutesForSchedule(run);
  const tickFireKey = buildFireTimeKey(run, params.timezone, im, params.tickAnchorMs);

  for (const row of low) {
    const prev = stateByItemId.get(row.itemId);
    const plan = computeLowInventorySendPlan(
      cadence,
      prev,
      dayKey,
      tickFireKey,
      params.tickAnchorMs,
      row.itemId,
    );

    if (cadence === "once_per_episode") {
      await LowInventoryAlertStateModel.updateOne(
        { locationId: lowOid, itemId: row.itemId },
        {
          $set: {
            isLow: true,
            locationName: params.locStoreNameForDb.trim() || null,
            itemName: row.name,
            categoryName: row.categoryName || null,
            uomName: row.uomName || null,
            lastOnHand: row.onHand,
            lastMinOnHand: row.minOnHand,
            ...(plan.nextEpisodeStartedAt ? { episodeStartedAt: plan.nextEpisodeStartedAt } : {}),
            ...(plan.nextLastAlertedAt ? { lastAlertedAt: plan.nextLastAlertedAt } : {}),
          },
          $setOnInsert: {
            episodeStartedAt: new Date(params.tickAnchorMs),
          },
        },
        { upsert: true },
      ).exec();
    }

    if (!plan.shouldSend) {
      continue;
    }

    out.push({
      settings: params.settings,
      locationId: params.locationId,
      storeName: params.storeLabel,
      category: "inventory_supply_chain",
      roleBindingSubcategory: "low_inventory",
      type: "alert_inventory_low_inventory",
      title: "Low inventory",
      message: formatLowInventoryAlertMessage(params.storeLabel, row),
      alertKind: "low_inventory",
      severity: "critical",
      fireKey: plan.fireKey,
      data: {
        sourceKey: "low_inventory",
        itemId: row.itemId,
        itemName: row.name,
        categoryName: row.categoryName,
        uomName: row.uomName,
        onHand: row.onHand,
        minOnHand: row.minOnHand,
        locationName: params.storeLabel,
      },
    });
  }
}

export async function collectInventoryEvaluateAlertPayloads(params: {
  settings: IAlertNotificationSettings;
  locationId: string;
  buyerGuid: string;
  timezone: string;
  tickAnchorMs: number;
  storeLabel: string;
  locStoreNameForDb: string;
}): Promise<InventoryAlertDispatchPayload[]> {
  const inventory = params.settings.inventorySupplyChain;
  const base = {
    settings: params.settings,
    locationId: params.locationId,
    buyerGuid: params.buyerGuid,
    timezone: params.timezone,
    tickAnchorMs: params.tickAnchorMs,
    storeLabel: params.storeLabel,
    locStoreNameForDb: params.locStoreNameForDb,
    inventory,
  };
  const out: InventoryAlertDispatchPayload[] = [];
  await appendDeliveryOverduePayloadIfDue(out, base);
  await appendLowInventoryPayloadsIfDue(out, base);
  return out;
}
