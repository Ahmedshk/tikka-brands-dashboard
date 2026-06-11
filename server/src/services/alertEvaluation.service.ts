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
import type { IAlertNotificationSettings, IAlertRoleBinding } from "../types/alertNotification.types.js";
import type { ILocationResponse } from "../types/location.types.js";
import { getTodayInTimezone } from "../utils/timezone.util.js";
import {
  intervalMinutesForSchedule,
  shouldRunAlertScheduleTick,
} from "../utils/alertScheduleRun.util.js";
import { assignmentHasOverdueModule } from "../utils/trainingOverdue.util.js";
import { getSalesLaborTimeRange, type LocationForSalesLabor } from "../utils/salesLaborControllerHelpers.js";
import { logger } from "../utils/logger.util.js";
import { loadFirstNamesByUserId } from "../utils/notificationRecipientFirstNames.util.js";
import { roleBindingMatchesSubcategory } from "../utils/alertRoleBindingSubcategory.util.js";
import {
  buildAlertEmailSendExtras,
  sliceDeliveryOverdueRowsForEmail,
  resolveFinancialKpiRowsForEmail,
} from "../utils/alertEvaluationSendAlertHelpers.util.js";
import {
  anyFinancialTogglesOn,
  buildFinancialLaborAlertChecks,
  buildFinancialLaborAlertSendData,
  fetchFoodCostPercentContextIfKeyed,
  fetchSalesLaborKpisForFinancialLabor,
  financialLaborNeedSquareLaborFetch,
  financialMetricKeysScheduledThisTick,
} from "../utils/alertEvaluationFinancialLaborHelpers.util.js";
import { buildFireTimeKey } from "../utils/alertFireTimeKey.util.js";
import { collectInventoryEvaluateAlertPayloads } from "../utils/alertEvaluationInventoryHelpers.util.js";
import { GoogleBusinessReviewModel } from "../models/googleBusinessReview.model.js";
import { buildLowRatingReviewFireKey } from "../utils/googleBusinessReviewHelpers.js";
import {
  buildLowRatingReviewInAppMessage,
  buildLowRatingReviewSmsMessage,
  formatLowRatingReviewUpdatedAtForEmail,
} from "../utils/lowRatingReviewAlertMessage.util.js";
import type { GoogleBusinessReviewSyncDiffItem } from "../types/googleBusinessReview.types.js";

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

const ALERT_EMAIL_CATEGORY_LABELS: Record<IAlertRoleBinding["category"], string> = {
  financial_labor: "Financial & labor",
  inventory_supply_chain: "Inventory & supply chain",
  reputation_hr: "Reputation & HR",
};

function getDashboardCommandCenterUrl(): string {
  const base = (
    process.env.CLIENT_URL ??
    process.env.APP_URL ??
    process.env.FRONTEND_URL ??
    "http://localhost:5173"
  ).replace(/\/$/, "");
  return `${base}/dashboard/command-center`;
}

function getDashboardRatingsReviewsUrl(): string {
  const base = (
    process.env.CLIENT_URL ??
    process.env.APP_URL ??
    process.env.FRONTEND_URL ??
    "http://localhost:5173"
  ).replace(/\/$/, "");
  return `${base}/dashboard/ratings-and-reviews`;
}

function getDashboardInventoryFoodCostUrl(): string {
  const base = (
    process.env.CLIENT_URL ??
    process.env.APP_URL ??
    process.env.FRONTEND_URL ??
    "http://localhost:5173"
  ).replace(/\/$/, "");
  return `${base}/dashboard/inventory-food-cost`;
}

function formatCountPeriodDateMmDdYyyy(s: string): string {
  const t = s.trim();
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(t);
  if (!m) return t;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function formatCountPeriodRangeMmDdYyyy(start: string, end: string): string {
  return `${formatCountPeriodDateMmDdYyyy(start)} → ${formatCountPeriodDateMmDdYyyy(end)}`;
}

function buildAlertEmailDetailRows(data: Record<string, unknown>): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const count = data.count;
  if (typeof count === "number" && Number.isFinite(count)) {
    rows.push({ label: "Affected count", value: String(count) });
  }
  const cps = data.countPeriodStart;
  const cpe = data.countPeriodEnd;
  if (typeof cps === "string" && cps.trim() && typeof cpe === "string" && cpe.trim()) {
    rows.push({
      label: "Count period",
      value: formatCountPeriodRangeMmDdYyyy(cps.trim(), cpe.trim()),
    });
  }
  const sk = data.sourceKey;
  if (typeof sk === "string" && sk.trim()) {
    rows.push({ label: "Alert code", value: sk });
  }
  return rows;
}

function alertEmailSeverityStyles(severity: "warning" | "critical"): {
  accentColorHex: string;
  calloutBg: string;
  calloutBorder: string;
  calloutText: string;
  severityLabel: string;
} {
  if (severity === "critical") {
    return {
      accentColorHex: "#DC2626",
      calloutBg: "#FEF2F2",
      calloutBorder: "#FECACA",
      calloutText: "#991B1B",
      severityLabel: "Critical",
    };
  }
  return {
    accentColorHex: "#D97706",
    calloutBg: "#FFFBEB",
    calloutBorder: "#FCD34D",
    calloutText: "#92400E",
    severityLabel: "Warning",
  };
}

async function mergeRecipientsForCategory(
  category: IAlertRoleBinding["category"],
  roleBindingSubcategory: string,
  locationId: string,
  settings: IAlertNotificationSettings,
): Promise<Map<string, Set<NotificationChannel>>> {
  const map = new Map<string, Set<NotificationChannel>>();
  const bindings = settings.roleBindings.filter(
    (b) => b.category === category && roleBindingMatchesSubcategory(b, roleBindingSubcategory),
  );
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
  /** Matches `IAlertRoleBinding.subcategory` for this alert source (see ALERT_ROLE_SUBCATEGORIES). */
  roleBindingSubcategory: string;
  type: NotificationType;
  title: string;
  message: string;
  alertKind: string;
  severity: "warning" | "critical";
  fireKey: string;
  data: Record<string, unknown>;
  inAppMessage?: string;
  smsBody?: string;
}): Promise<void> {
  const logged = await tryLogAlert({
    locationId: params.locationId,
    alertKind: params.alertKind,
    severity: params.severity,
    fireKey: params.fireKey,
  });
  if (!logged) {
    return;
  }

  const recipients = await mergeRecipientsForCategory(
    params.category,
    params.roleBindingSubcategory,
    params.locationId,
    params.settings,
  );
  if (recipients.size === 0) {
    logger.debug("[Alerts] No recipients for category / subcategory", {
      category: params.category,
      roleBindingSubcategory: params.roleBindingSubcategory,
      locationId: params.locationId,
    });
    return;
  }

  const recipientEntries = [...recipients.entries()];
  const emailRecipientIds = recipientEntries
    .filter(([, chSet]) => chSet.has("email"))
    .map(([id]) => id);
  const firstNameById = await loadFirstNamesByUserId(emailRecipientIds);
  const commandCenterUrl = getDashboardCommandCenterUrl();
  const inventoryFoodCostUrl = getDashboardInventoryFoodCostUrl();
  const isDeliveryOverdueEmail = params.alertKind === "delivery_overdue";
  const isLowInventoryEmail = params.alertKind === "low_inventory";
  const isLowRatingReviewEmail = params.alertKind === "low_rating_review";
  const ratingsReviewsUrl = getDashboardRatingsReviewsUrl();
  const { overdueRowsForEmail, overdueMoreCount } = sliceDeliveryOverdueRowsForEmail(
    params.alertKind,
    params.data,
  );
  const financialKpiRowsForEmail = resolveFinancialKpiRowsForEmail(
    params.category,
    params.data,
  );
  const emailActionUrl = isDeliveryOverdueEmail
    ? inventoryFoodCostUrl
    : isLowRatingReviewEmail
      ? typeof params.data.ratingsUrl === "string"
        ? params.data.ratingsUrl
        : ratingsReviewsUrl
      : commandCenterUrl;
  const emailPrimaryButtonText = isDeliveryOverdueEmail
    ? "Open Inventory & Food Cost"
    : isLowRatingReviewEmail
      ? "Open Ratings & Reviews"
      : "Open Command Center";
  const sevStyles = alertEmailSeverityStyles(params.severity);
  const categoryLabel = ALERT_EMAIL_CATEGORY_LABELS[params.category];
  const detailRows = buildAlertEmailDetailRows(params.data);

  for (const [recipientId, chSet] of recipientEntries) {
    const channels = [...chSet];
    if (channels.length === 0) continue;

    await notificationService.sendReturningDelivered({
      recipientId,
      type: params.type,
      title: params.title,
      message: params.message,
      ...(params.inAppMessage != null ? { inAppMessage: params.inAppMessage } : {}),
      ...(params.smsBody != null ? { smsBody: params.smsBody } : {}),
      data: {
        ...params.data,
        locationId: params.locationId,
        category: params.category,
        severity: params.severity,
        alertKind: params.alertKind,
      },
      channels,
      ...buildAlertEmailSendExtras({
        wantsEmail: chSet.has("email"),
        title: params.title,
        message: params.message,
        categoryLabel,
        locationLine: params.storeName,
        recipientFirstName: firstNameById.get(recipientId) ?? "",
        sevStyles,
        detailRows,
        isLowInventoryEmail,
        isLowRatingReviewEmail,
        data: params.data,
        storeName: params.storeName,
        overdueRowsForEmail,
        overdueMoreCount,
        financialKpiRowsForEmail,
        emailActionUrl,
        emailPrimaryButtonText,
      }),
    });
  }
}

async function evaluateFinancialLabor(
  loc: ILocationResponse,
  settings: IAlertNotificationSettings,
  tickAnchorMs: number,
): Promise<void> {
  const locationId = String(loc._id ?? "");

  if (!anyFinancialTogglesOn(settings.financialLabor)) {
    return;
  }

  if (!locationId) {
    return;
  }

  const timezone = loc.timezone?.trim() || "America/Denver";

  const keysThisTick = financialMetricKeysScheduledThisTick(
    settings.financialLabor,
    timezone,
    tickAnchorMs,
  );
  if (keysThisTick.length === 0) {
    return;
  }

  const creds = await locationService.getByIdWithCredentials(locationId);
  if (!creds) {
    return;
  }

  const { location, squareAccessToken, homebaseApiKey } = creds;
  const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
  const todayInTz = getTodayInTimezone(timezone);
  const goalResult = await goalService.getByLocationIdAndDate(locationId, todayInTz);
  const g = goalResult.goals;

  const needSlFetch = financialLaborNeedSquareLaborFetch(keysThisTick);

  const locSl: LocationForSalesLabor = {
    timezone: location.timezone,
    businessStartTime: location.businessStartTime,
    squareLocationId: location.squareLocationId,
    homebaseLocationId: location.homebaseLocationId,
  };
  const range = getSalesLaborTimeRange(locSl);
  const rollupCtx = { timezone, businessStartTime };

  const full = await fetchSalesLaborKpisForFinancialLabor({
    needSlFetch,
    location,
    squareAccessToken: squareAccessToken ?? undefined,
    homebaseApiKey: homebaseApiKey ?? undefined,
    locationId,
    range,
    rollupCtx,
  });

  const baseData = { locationName: location.storeName };

  const { foodPct, foodCountPeriod } = await fetchFoodCostPercentContextIfKeyed({
    keysThisTick,
    foodCostToggles: settings.financialLabor.foodCostPct,
    buyerGuid: location.marketManBuyerGuid,
    timezone,
    locationId,
  });

  const checks = buildFinancialLaborAlertChecks({
    full,
    g,
    keysThisTick,
    storeName: location.storeName,
    financialLabor: settings.financialLabor,
    foodPct,
    foodCountPeriod,
    formatCountPeriodRange: formatCountPeriodRangeMmDdYyyy,
  });

  for (const c of checks) {
    const sev = c.severity;
    if (!sev) continue;
    const type = sev === "warning" ? c.warnType : c.critType;
    const run = settings.financialLabor[c.metricKey].run;
    const im = intervalMinutesForSchedule(run);
    const fireKey = buildFireTimeKey(run, timezone, im, tickAnchorMs);
    await sendAlert({
      settings,
      locationId,
      storeName: location.storeName,
      category: "financial_labor",
      roleBindingSubcategory: c.metricKey,
      type,
      title: c.title,
      message: c.buildMessage(sev),
      alertKind: c.key,
      severity: sev,
      fireKey,
      data: buildFinancialLaborAlertSendData(baseData, c, foodCountPeriod),
    });
  }
}

async function evaluateInventory(
  loc: ILocationResponse,
  settings: IAlertNotificationSettings,
  tickAnchorMs: number,
): Promise<void> {
  const locationId = String(loc._id ?? "");
  const buyerGuid = loc.marketManBuyerGuid?.trim();
  if (!locationId || !buyerGuid) {
    return;
  }

  const timezone = loc.timezone?.trim() || "America/Denver";
  const storeLabel = loc.storeName ?? "Location";
  const payloads = await collectInventoryEvaluateAlertPayloads({
    settings,
    locationId,
    buyerGuid,
    timezone,
    tickAnchorMs,
    storeLabel,
    locStoreNameForDb: (loc.storeName ?? "").trim(),
  });

  for (const p of payloads) {
    await sendAlert(p);
  }
}

export async function sendLowRatingReviewAlert(params: {
  settings: IAlertNotificationSettings;
  locationId: string;
  storeName: string;
  timezone: string;
  review: GoogleBusinessReviewSyncDiffItem;
}): Promise<void> {
  const { review } = params;
  const stars = review.starRatingNumeric;
  const threshold = params.settings.reputationHr.lowRatingThreshold ?? 3;
  const commentText = review.comment?.trim() ?? "";
  const messageParams = {
    storeName: params.storeName,
    reviewerDisplayName: review.reviewerDisplayName,
    starRatingNumeric: stars,
    threshold,
    comment: commentText,
  };
  const inAppMessage = buildLowRatingReviewInAppMessage(messageParams);
  const smsBody = buildLowRatingReviewSmsMessage(messageParams);
  await sendAlert({
    settings: params.settings,
    locationId: params.locationId,
    storeName: params.storeName,
    category: "reputation_hr",
    roleBindingSubcategory: "low_rating_reviews",
    type: "alert_low_rating_review",
    title: "Low Google review rating",
    message: inAppMessage,
    inAppMessage,
    smsBody,
    alertKind: "low_rating_review",
    severity: "warning",
    fireKey: buildLowRatingReviewFireKey(review.googleReviewId, review.updateTime),
    data: {
      sourceKey: "low_rating_review",
      googleReviewId: review.googleReviewId,
      starRatingNumeric: stars,
      reviewerDisplayName: review.reviewerDisplayName,
      alertThreshold: threshold,
      locationName: params.storeName,
      reviewComment: commentText,
      reviewUpdatedAt: formatLowRatingReviewUpdatedAtForEmail(
        review.updateTime,
        params.timezone,
      ),
      ratingsUrl: getDashboardRatingsReviewsUrl(),
    },
  });
}

async function evaluateReputationHr(
  loc: ILocationResponse,
  settings: IAlertNotificationSettings,
  tickAnchorMs: number,
): Promise<void> {
  const locationId = String(loc._id ?? "");
  if (!locationId) {
    return;
  }

  const timezone = loc.timezone?.trim() || "America/Denver";

  if (settings.reputationHr.trainingOverdue) {
    const tr = settings.reputationHr.trainingRun;
    if (shouldRunAlertScheduleTick(tr, timezone, tickAnchorMs)) {
      const n = await countTrainingOverdueForLocation(locationId);
      if (n > 0) {
        const im = intervalMinutesForSchedule(tr);
        const fireKey = buildFireTimeKey(tr, timezone, im, tickAnchorMs);
        await sendAlert({
          settings,
          locationId,
          storeName: loc.storeName ?? "Location",
          category: "reputation_hr",
          roleBindingSubcategory: "training_overdue",
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
    if (shouldRunAlertScheduleTick(pr, timezone, tickAnchorMs)) {
      const n = await countPendingPipsForLocation(locationId);
      if (n > 0) {
        const im = intervalMinutesForSchedule(pr);
        const fireKey = buildFireTimeKey(pr, timezone, im, tickAnchorMs);
        await sendAlert({
          settings,
          locationId,
          storeName: loc.storeName ?? "Location",
          category: "reputation_hr",
          roleBindingSubcategory: "pending_pips",
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

  if (settings.reputationHr.lowRatingReviews) {
    const lr = settings.reputationHr.lowRatingReviewsRun;
    if (shouldRunAlertScheduleTick(lr, timezone, tickAnchorMs)) {
      const threshold = settings.reputationHr.lowRatingThreshold ?? 3;
      const im = intervalMinutesForSchedule(lr);
      const since = new Date(tickAnchorMs - im * 60 * 1000);
      const reviews = await GoogleBusinessReviewModel.find({
        locationId,
        starRatingNumeric: { $lt: threshold },
        updateTime: { $gte: since },
      })
        .select("googleReviewId starRatingNumeric reviewer.displayName comment updateTime")
        .lean();

      for (const r of reviews) {
        await sendLowRatingReviewAlert({
          settings,
          locationId,
          storeName: loc.storeName ?? "Location",
          timezone,
          review: {
            googleReviewId: r.googleReviewId,
            starRatingNumeric: r.starRatingNumeric,
            reviewerDisplayName: r.reviewer?.displayName ?? "Reviewer",
            ...(r.comment != null ? { comment: r.comment } : {}),
            updateTime: r.updateTime,
            isNew: false,
          },
        });
      }
    }
  }
}

function hasAnyAlertRule(settings: IAlertNotificationSettings): boolean {
  if (anyFinancialTogglesOn(settings.financialLabor)) return true;
  if (settings.inventorySupplyChain.deliveryOverdueNotReceived) return true;
  if (settings.inventorySupplyChain.lowInventoryEnabled) return true;
  if (settings.reputationHr.trainingOverdue || settings.reputationHr.pendingPips) return true;
  if (settings.reputationHr.lowRatingReviews) return true;
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

    /** One instant for the whole run so slow early locations do not shift Date.now() and skip schedules for later ones. */
    const tickAnchorMs = Date.now();

    for (const loc of locations) {
      await evaluateFinancialLabor(loc, settings, tickAnchorMs);
      await evaluateInventory(loc, settings, tickAnchorMs);
      await evaluateReputationHr(loc, settings, tickAnchorMs);
    }
  } catch (err) {
    logger.error("[Alerts] runAlertEvaluation failed", { err });
  }
}
