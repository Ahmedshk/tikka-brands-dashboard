import mongoose from "mongoose";
import { AlertNotificationLogModel } from "../models/alertNotificationLog.model.js";
import { NotificationService } from "./notification.service.js";
import { AlertNotificationSettingsService } from "./alertNotificationSettings.service.js";
import { LocationService } from "./location.service.js";
import { GoalService } from "./goal.service.js";
import { TrainingAssignmentService } from "./trainingAssignment.service.js";
import { UserService } from "./user.service.js";
import { DisciplinaryIncidentRepository } from "../repositories/disciplinaryIncident.repository.js";
import { listUserIdsForRoleAtLocation } from "./calendarNotificationRecipients.service.js";
import type { NotificationChannel, NotificationType } from "../types/notification.types.js";
import type {
  IAlertNotificationSettings,
  IAlertRoleBinding,
  IAlertRunSchedule,
} from "../types/alertNotification.types.js";
import type { ILocationResponse } from "../types/location.types.js";
import { getTodayInTimezone } from "../utils/timezone.util.js";
import { getLocalTimeHmInTimezone, normalizeHm } from "../utils/alertTime.util.js";
import {
  intervalMinutesForSchedule,
  shouldRunAlertScheduleTick,
} from "../utils/alertScheduleRun.util.js";
import {
  classifyHigherIsBetter,
  classifyLowerIsBetter,
  type GoalAlertSeverity,
} from "../utils/alertGoalSeverity.util.js";
import { assignmentHasOverdueModule } from "../utils/trainingOverdue.util.js";
import { parseMarketManUtcToDate } from "../utils/marketmanUtcDateParse.util.js";
import {
  buildSalesLaborKpisFullData,
  fetchLaborCostAndHours,
  fetchSquareOrderStatsAndSources,
  getSalesLaborTimeRange,
  type LocationForSalesLabor,
} from "../utils/salesLaborControllerHelpers.js";
import { formatMarketManDateUtc } from "./marketman.client.js";
import { getInventoryKPIs, getOrdersByDeliveryDate } from "./marketman.service.js";
import type { MarketManOrder, OrderTrackerRange } from "./marketman.service.js";
import { loadMarketManOrdersFromOrderCacheByKindInRange } from "../utils/inventoryOrderCacheRead.util.js";
import { isExternalDataCacheReadEnabled } from "../config/externalDataCache.config.js";
import { logger } from "../utils/logger.util.js";

const alertSettingsService = new AlertNotificationSettingsService();
const locationService = new LocationService();
const goalService = new GoalService();
const notificationService = new NotificationService();
const trainingAssignmentService = new TrainingAssignmentService();
const userService = new UserService();
const disciplinaryRepo = new DisciplinaryIncidentRepository();

function channelsToList(channels: {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}): NotificationChannel[] {
  const out: NotificationChannel[] = [];
  if (channels.inApp) out.push("in_app");
  if (channels.email) out.push("email");
  if (channels.sms) out.push("sms");
  return out.length ? out : ["in_app"];
}

async function mergeRecipientsForCategory(
  category: IAlertRoleBinding["category"],
  locationId: string,
  settings: IAlertNotificationSettings,
): Promise<Map<string, Set<NotificationChannel>>> {
  const map = new Map<string, Set<NotificationChannel>>();
  const bindings = settings.roleBindings.filter((b) => b.category === category);
  for (const b of bindings) {
    const userIds = await listUserIdsForRoleAtLocation(String(b.roleId), locationId);
    const ch = channelsToList(b.channels);
    for (const uid of userIds) {
      if (!map.has(uid)) map.set(uid, new Set());
      for (const c of ch) map.get(uid)!.add(c);
    }
  }
  return map;
}

async function tryLogAlert(params: {
  locationId: string;
  alertKind: string;
  severity: "warning" | "critical";
  fireKey: string;
}): Promise<boolean> {
  try {
    await AlertNotificationLogModel.create({
      locationId: new mongoose.Types.ObjectId(params.locationId),
      alertKind: params.alertKind,
      severity: params.severity,
      fireKey: params.fireKey,
    });
    return true;
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code;
    if (code === 11000) return false;
    logger.error("AlertNotificationLog insert failed", { e, params });
    return false;
  }
}

function buildFireTimeKey(
  schedule: IAlertRunSchedule,
  timezone: string,
  intervalMinutes: number,
): string {
  const day = getTodayInTimezone(timezone);
  if (schedule.scheduleMode === "interval") {
    const bucket = Math.floor(Date.now() / (intervalMinutes * 60 * 1000));
    return `${day}|i${bucket}`;
  }
  const hm = getLocalTimeHmInTimezone(timezone);
  return `${day}|t${normalizeHm(hm)}`;
}

function deliveryUtcToLocalDateKey(utcDelivery: string | undefined, timezone: string): string | null {
  const d = parseMarketManUtcToDate(utcDelivery);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone.trim(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}`;
}

function isOrderReceivedStatus(status: string): boolean {
  const t = status.trim().toLowerCase();
  return t.includes("received");
}

function isOrderCancelledStatus(status: string): boolean {
  const t = status.trim().toLowerCase();
  return t.includes("cancel");
}

function buildAlertOrderRange(): OrderTrackerRange {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 120);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + 14);
  to.setUTCHours(23, 59, 59, 0);
  return {
    dateTimeFromUTC: formatMarketManDateUtc(from),
    dateTimeToUTC: formatMarketManDateUtc(to),
  };
}

async function countOverdueDeliveriesNotReceived(
  locationId: string,
  buyerGuid: string,
  timezone: string,
): Promise<number> {
  const range = buildAlertOrderRange();
  const useCache = isExternalDataCacheReadEnabled() && Boolean(locationId.trim());
  let orders: MarketManOrder[];
  try {
    if (useCache) {
      orders = await loadMarketManOrdersFromOrderCacheByKindInRange(
        locationId,
        buyerGuid,
        "delivery",
        range,
      );
    } else {
      orders = await getOrdersByDeliveryDate(
        buyerGuid,
        range.dateTimeFromUTC,
        range.dateTimeToUTC,
      );
    }
  } catch (err) {
    logger.warn("[Alerts] MarketMan orders fetch failed", { locationId, err });
    return 0;
  }

  const todayKey = getTodayInTimezone(timezone);
  let n = 0;
  for (const o of orders) {
    const status = String(o.OrderStatusUIName ?? "").trim();
    if (!status || isOrderCancelledStatus(status)) continue;
    if (isOrderReceivedStatus(status)) continue;
    const dk = deliveryUtcToLocalDateKey(o.DeliveryDateUTC, timezone);
    if (dk != null && dk < todayKey) n += 1;
  }
  return n;
}

async function countTrainingOverdueForLocation(locationId: string): Promise<number> {
  const { list } = await trainingAssignmentService.listByLocationId(locationId);
  let n = 0;
  for (const row of list) {
    if (row.status === "Complete") continue;
    if (
      assignmentHasOverdueModule(row.assignedAt, row.moduleDurations, row.moduleProgress)
    ) {
      n += 1;
    }
  }
  return n;
}

async function countPendingPipsForLocation(locationId: string): Promise<number> {
  const ids = await userService.getUserIdsWithAccessToLocation(locationId);
  if (ids.length === 0) return 0;
  const map = await disciplinaryRepo.aggregatePendingSignatureCountsByEmployeeIds(ids);
  let s = 0;
  for (const v of map.values()) s += v;
  return s;
}

async function sendAlert(params: {
  settings: IAlertNotificationSettings;
  locationId: string;
  storeName: string;
  category: IAlertRoleBinding["category"];
  type: NotificationType;
  title: string;
  message: string;
  alertKind: string;
  severity: "warning" | "critical";
  fireKey: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const logged = await tryLogAlert({
    locationId: params.locationId,
    alertKind: params.alertKind,
    severity: params.severity,
    fireKey: params.fireKey,
  });
  if (!logged) return;

  const recipients = await mergeRecipientsForCategory(
    params.category,
    params.locationId,
    params.settings,
  );
  if (recipients.size === 0) {
    logger.debug("[Alerts] No recipients for category", {
      category: params.category,
      locationId: params.locationId,
    });
    return;
  }

  for (const [recipientId, chSet] of recipients) {
    const channels = [...chSet];
    if (channels.length === 0) continue;
    await notificationService.sendReturningDelivered({
      recipientId,
      type: params.type,
      title: params.title,
      message: params.message,
      data: {
        ...params.data,
        locationId: params.locationId,
        category: params.category,
        severity: params.severity,
        alertKind: params.alertKind,
      },
      channels,
    });
  }
}

const FINANCIAL_METRIC_KEYS = ["sales", "laborCostPct", "hours", "spmh", "foodCostPct"] as const;
type FinancialMetricKey = (typeof FINANCIAL_METRIC_KEYS)[number];

function anyFinancialTogglesOn(fl: IAlertNotificationSettings["financialLabor"]): boolean {
  for (const k of FINANCIAL_METRIC_KEYS) {
    const t = fl[k];
    if (t.warnInToleranceZone || t.alertBeyondTolerance) return true;
  }
  return false;
}

async function evaluateFinancialLabor(
  loc: ILocationResponse,
  settings: IAlertNotificationSettings,
): Promise<void> {
  if (!anyFinancialTogglesOn(settings.financialLabor)) return;

  const locationId = String(loc._id ?? "");
  if (!locationId) return;

  const timezone = loc.timezone?.trim() || "America/Denver";

  const keysThisTick = FINANCIAL_METRIC_KEYS.filter((k) => {
    const m = settings.financialLabor[k];
    return (
      (m.warnInToleranceZone || m.alertBeyondTolerance) &&
      shouldRunAlertScheduleTick(m.run, timezone)
    );
  });
  if (keysThisTick.length === 0) return;

  const creds = await locationService.getByIdWithCredentials(locationId);
  if (!creds) return;

  const { location, squareAccessToken, homebaseApiKey } = creds;
  const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
  const todayInTz = getTodayInTimezone(timezone);
  const goalResult = await goalService.getByLocationIdAndDate(locationId, todayInTz);
  const g = goalResult.goals;

  const needSlFetch = (["sales", "laborCostPct", "hours", "spmh"] as const).some((k) =>
    keysThisTick.includes(k),
  );

  const locSl: LocationForSalesLabor = {
    timezone: location.timezone,
    businessStartTime: location.businessStartTime,
    squareLocationId: location.squareLocationId,
    homebaseLocationId: location.homebaseLocationId,
  };
  const range = getSalesLaborTimeRange(locSl);
  const rollupCtx = { timezone, businessStartTime };

  const [squareData, laborData] = needSlFetch
    ? await Promise.all([
        location.squareLocationId?.trim()
          ? fetchSquareOrderStatsAndSources(
              location.squareLocationId.trim(),
              range,
              squareAccessToken ?? undefined,
              locationId,
              rollupCtx,
            )
          : Promise.resolve(null),
        location.homebaseLocationId?.trim()
          ? fetchLaborCostAndHours(
              location.homebaseLocationId.trim(),
              range,
              homebaseApiKey ?? undefined,
              locationId,
            )
          : Promise.resolve(null),
      ])
    : [null, null];

  const full = buildSalesLaborKpisFullData(squareData, laborData);

  const baseData = { locationName: location.storeName };

  const checks: Array<{
    metricKey: FinancialMetricKey;
    key: string;
    severity: GoalAlertSeverity;
    warnType: NotificationType;
    critType: NotificationType;
    title: string;
    buildMessage: (sev: "warning" | "critical") => string;
  }> = [];

  const sSales = classifyHigherIsBetter(
    full.actualTotalSales,
    g.salesGoal ?? 0,
    g.salesGoalTolerance ?? 0,
    settings.financialLabor.sales,
  );
  if (sSales && keysThisTick.includes("sales")) {
    checks.push({
      metricKey: "sales",
      key: "sales_goal",
      severity: sSales,
      warnType: "alert_goal_sales_warning",
      critType: "alert_goal_sales_critical",
      title: "Sales goal",
      buildMessage: (sev) =>
        sev === "warning"
          ? `${location.storeName}: Net sales are below goal but within the tolerance band.`
          : `${location.storeName}: Net sales are below goal beyond tolerance.`,
    });
  }

  const sLabor = classifyLowerIsBetter(
    full.actualLaborCostPercent,
    g.laborCostGoal ?? 0,
    g.laborCostGoalTolerance ?? 0,
    settings.financialLabor.laborCostPct,
  );
  if (sLabor && keysThisTick.includes("laborCostPct")) {
    checks.push({
      metricKey: "laborCostPct",
      key: "labor_pct",
      severity: sLabor,
      warnType: "alert_goal_labor_pct_warning",
      critType: "alert_goal_labor_pct_critical",
      title: "Labor cost %",
      buildMessage: (sev) =>
        sev === "warning"
          ? `${location.storeName}: Labor cost % is above goal but within tolerance.`
          : `${location.storeName}: Labor cost % is above goal beyond tolerance.`,
    });
  }

  const sHours = classifyLowerIsBetter(
    full.totalHours,
    g.hoursGoal ?? 0,
    g.hoursGoalTolerance ?? 0,
    settings.financialLabor.hours,
  );
  if (sHours && keysThisTick.includes("hours")) {
    checks.push({
      metricKey: "hours",
      key: "hours",
      severity: sHours,
      warnType: "alert_goal_hours_warning",
      critType: "alert_goal_hours_critical",
      title: "Hours goal",
      buildMessage: (sev) =>
        sev === "warning"
          ? `${location.storeName}: Hours are above goal but within tolerance.`
          : `${location.storeName}: Hours are above goal beyond tolerance.`,
    });
  }

  const sSpmh = classifyHigherIsBetter(
    full.salesPerManHour,
    g.spmhGoal ?? 0,
    g.spmhGoalTolerance ?? 0,
    settings.financialLabor.spmh,
  );
  if (sSpmh && keysThisTick.includes("spmh")) {
    checks.push({
      metricKey: "spmh",
      key: "spmh",
      severity: sSpmh,
      warnType: "alert_goal_spmh_warning",
      critType: "alert_goal_spmh_critical",
      title: "SPMH goal",
      buildMessage: (sev) =>
        sev === "warning"
          ? `${location.storeName}: SPMH is below goal but within tolerance.`
          : `${location.storeName}: SPMH is below goal beyond tolerance.`,
    });
  }

  let foodPct: number | null = null;
  if (
    keysThisTick.includes("foodCostPct") &&
    (settings.financialLabor.foodCostPct.warnInToleranceZone ||
      settings.financialLabor.foodCostPct.alertBeyondTolerance)
  ) {
    const buyerGuid = location.marketManBuyerGuid?.trim();
    if (buyerGuid) {
      try {
        const inv = await getInventoryKPIs(
          buyerGuid,
          timezone,
          ["foodCostPercent"],
          "thisWeek",
          undefined,
          undefined,
          isExternalDataCacheReadEnabled() ? locationId : null,
        );
        foodPct = inv.foodCostPercent ?? null;
      } catch (err) {
        logger.warn("[Alerts] Food cost KPI fetch failed", { locationId, err });
      }
    }
  }

  const sFood = classifyLowerIsBetter(
    foodPct,
    g.foodCostGoal ?? 0,
    g.foodCostGoalTolerance ?? 0,
    settings.financialLabor.foodCostPct,
  );
  if (sFood && keysThisTick.includes("foodCostPct")) {
    checks.push({
      metricKey: "foodCostPct",
      key: "food_cost",
      severity: sFood,
      warnType: "alert_goal_food_cost_warning",
      critType: "alert_goal_food_cost_critical",
      title: "Food cost %",
      buildMessage: (sev) =>
        sev === "warning"
          ? `${location.storeName}: Food cost % is above goal but within tolerance.`
          : `${location.storeName}: Food cost % is above goal beyond tolerance.`,
    });
  }

  for (const c of checks) {
    const sev = c.severity;
    if (!sev) continue;
    const type = sev === "warning" ? c.warnType : c.critType;
    const run = settings.financialLabor[c.metricKey].run;
    const im = intervalMinutesForSchedule(run);
    const fireKey = buildFireTimeKey(run, timezone, im);
    await sendAlert({
      settings,
      locationId,
      storeName: location.storeName,
      category: "financial_labor",
      type,
      title: c.title,
      message: c.buildMessage(sev),
      alertKind: c.key,
      severity: sev,
      fireKey,
      data: { ...baseData, sourceKey: c.key },
    });
  }
}

async function evaluateInventory(
  loc: ILocationResponse,
  settings: IAlertNotificationSettings,
): Promise<void> {
  if (!settings.inventorySupplyChain.deliveryOverdueNotReceived) return;
  const locationId = String(loc._id ?? "");
  const buyerGuid = loc.marketManBuyerGuid?.trim();
  if (!locationId || !buyerGuid) return;

  const timezone = loc.timezone?.trim() || "America/Denver";
  const run = settings.inventorySupplyChain.run;
  if (!shouldRunAlertScheduleTick(run, timezone)) return;

  const n = await countOverdueDeliveriesNotReceived(locationId, buyerGuid, timezone);
  if (n <= 0) return;

  const im = intervalMinutesForSchedule(run);
  const fireKey = buildFireTimeKey(run, timezone, im);

  await sendAlert({
    settings,
    locationId,
    storeName: loc.storeName ?? "Location",
    category: "inventory_supply_chain",
    type: "alert_inventory_delivery_overdue",
    title: "Delivery overdue",
    message: `${loc.storeName ?? "Location"}: ${n} order(s) have a past delivery date and are not marked received.`,
    alertKind: "delivery_overdue",
    severity: "critical",
    fireKey,
    data: { sourceKey: "delivery_overdue", count: n },
  });
}

async function evaluateReputationHr(
  loc: ILocationResponse,
  settings: IAlertNotificationSettings,
): Promise<void> {
  const locationId = String(loc._id ?? "");
  if (!locationId) return;

  const timezone = loc.timezone?.trim() || "America/Denver";

  if (settings.reputationHr.trainingOverdue) {
    const tr = settings.reputationHr.trainingRun;
    if (shouldRunAlertScheduleTick(tr, timezone)) {
      const n = await countTrainingOverdueForLocation(locationId);
      if (n > 0) {
        const im = intervalMinutesForSchedule(tr);
        const fireKey = buildFireTimeKey(tr, timezone, im);
        await sendAlert({
          settings,
          locationId,
          storeName: loc.storeName ?? "Location",
          category: "reputation_hr",
          type: "alert_training_overdue",
          title: "Training overdue",
          message: `${loc.storeName ?? "Location"}: ${n} training assignment(s) are overdue.`,
          alertKind: "training_overdue",
          severity: "critical",
          fireKey,
          data: { sourceKey: "training_overdue", count: n },
        });
      }
    }
  }

  if (settings.reputationHr.pendingPips) {
    const pr = settings.reputationHr.pendingPipsRun;
    if (shouldRunAlertScheduleTick(pr, timezone)) {
      const n = await countPendingPipsForLocation(locationId);
      if (n > 0) {
        const im = intervalMinutesForSchedule(pr);
        const fireKey = buildFireTimeKey(pr, timezone, im);
        await sendAlert({
          settings,
          locationId,
          storeName: loc.storeName ?? "Location",
          category: "reputation_hr",
          type: "alert_pip_pending",
          title: "Pending PIPs",
          message: `${loc.storeName ?? "Location"}: ${n} pending signature(s) on disciplinary documents.`,
          alertKind: "pip_pending",
          severity: "warning",
          fireKey,
          data: { sourceKey: "pip_pending", count: n },
        });
      }
    }
  }
}

function hasAnyAlertRule(settings: IAlertNotificationSettings): boolean {
  if (anyFinancialTogglesOn(settings.financialLabor)) return true;
  if (settings.inventorySupplyChain.deliveryOverdueNotReceived) return true;
  if (settings.reputationHr.trainingOverdue || settings.reputationHr.pendingPips) return true;
  return false;
}

/**
 * Run alert checks for all locations. Each enabled rule uses its own schedule (fixed local times or interval).
 * Agenda invokes this job every minute; rules gate themselves with shouldRunAlertScheduleTick.
 */
export async function runAlertEvaluation(): Promise<void> {
  try {
    const settings = await alertSettingsService.get();
    if (!hasAnyAlertRule(settings)) {
      logger.debug("[Alerts] No rules enabled, skip");
      return;
    }

    const locations = await locationService.getAll();

    for (const loc of locations) {
      await evaluateFinancialLabor(loc, settings);
      await evaluateInventory(loc, settings);
      await evaluateReputationHr(loc, settings);
    }
  } catch (err) {
    logger.error("[Alerts] runAlertEvaluation failed", { err });
  }
}
