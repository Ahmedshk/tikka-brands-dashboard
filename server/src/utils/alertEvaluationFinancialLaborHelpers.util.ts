import { isExternalDataCacheReadEnabled } from "../config/externalDataCache.config.js";
import { getInventoryKPIs } from "../services/marketman.service.js";
import type { IAlertNotificationSettings } from "../types/alertNotification.types.js";
import type { IGoal } from "../types/goal.types.js";
import type { NotificationType } from "../types/notification.types.js";
import type { SalesLaborKPIsData } from "../types/salesLabor.types.js";
import {
  classifyHigherIsBetter,
  classifyLowerIsBetter,
  type GoalAlertSeverity,
} from "./alertGoalSeverity.util.js";
import {
  buildFinancialKpiEmailRows,
  type FinancialMetricKeyForAlert,
} from "./alertFinancialKpiEmail.util.js";
import { shouldRunAlertScheduleTick } from "./alertScheduleRun.util.js";
import type { TimeRange } from "./businessHours.util.js";
import { logger } from "./logger.util.js";
import {
  buildSalesLaborKpisFullData,
  fetchLaborCostAndHours,
  fetchSquareOrderStatsAndSources,
} from "./salesLaborControllerHelpers.js";

export const FINANCIAL_METRIC_KEYS = [
  "sales",
  "laborCostPct",
  "hours",
  "spmh",
  "foodCostPct",
] as const;

export type FinancialMetricKey = (typeof FINANCIAL_METRIC_KEYS)[number];

export function anyFinancialTogglesOn(
  fl: IAlertNotificationSettings["financialLabor"],
): boolean {
  for (const k of FINANCIAL_METRIC_KEYS) {
    const t = fl[k];
    if (t.warnInToleranceZone || t.alertBeyondTolerance) return true;
  }
  return false;
}

export function financialMetricKeysScheduledThisTick(
  financialLabor: IAlertNotificationSettings["financialLabor"],
  timezone: string,
  tickAnchorMs: number,
): FinancialMetricKey[] {
  return [...FINANCIAL_METRIC_KEYS].filter((k) => {
    const m = financialLabor[k];
    return (
      (m.warnInToleranceZone || m.alertBeyondTolerance) &&
      shouldRunAlertScheduleTick(m.run, timezone, tickAnchorMs)
    );
  });
}

export function financialLaborNeedSquareLaborFetch(keysThisTick: FinancialMetricKey[]): boolean {
  return (["sales", "laborCostPct", "hours", "spmh"] as const).some((k) =>
    keysThisTick.includes(k),
  );
}

type LocationForFinancialLaborFetch = {
  timezone: string | undefined;
  businessStartTime: string | undefined;
  squareLocationId: string | undefined;
  homebaseLocationId: string | undefined;
};

export async function fetchSalesLaborKpisForFinancialLabor(params: {
  needSlFetch: boolean;
  location: LocationForFinancialLaborFetch;
  squareAccessToken: string | undefined;
  homebaseApiKey: string | undefined;
  locationId: string;
  range: TimeRange;
  rollupCtx: { timezone: string; businessStartTime: string };
}): Promise<SalesLaborKPIsData> {
  if (!params.needSlFetch) {
    return buildSalesLaborKpisFullData(null, null);
  }

  const { location, squareAccessToken, homebaseApiKey, locationId, range, rollupCtx } = params;

  const squareP = location.squareLocationId?.trim()
    ? fetchSquareOrderStatsAndSources(
        location.squareLocationId.trim(),
        range,
        squareAccessToken ?? undefined,
        locationId,
        rollupCtx,
      )
    : Promise.resolve(null);

  const laborP = location.homebaseLocationId?.trim()
    ? fetchLaborCostAndHours(
        location.homebaseLocationId.trim(),
        range,
        homebaseApiKey ?? undefined,
        locationId,
      )
    : Promise.resolve(null);

  const [squareData, laborData] = await Promise.all([squareP, laborP]);
  return buildSalesLaborKpisFullData(squareData, laborData);
}

export async function fetchFoodCostPercentContextIfKeyed(params: {
  keysThisTick: readonly FinancialMetricKey[];
  foodCostToggles: IAlertNotificationSettings["financialLabor"]["foodCostPct"];
  buyerGuid: string | undefined;
  timezone: string;
  locationId: string;
}): Promise<{
  foodPct: number | null;
  foodCountPeriod: { start: string; end: string } | null;
}> {
  const empty: {
    foodPct: number | null;
    foodCountPeriod: { start: string; end: string } | null;
  } = { foodPct: null, foodCountPeriod: null };

  if (!params.keysThisTick.includes("foodCostPct")) {
    return empty;
  }

  if (
    !params.foodCostToggles.warnInToleranceZone &&
    !params.foodCostToggles.alertBeyondTolerance
  ) {
    return empty;
  }

  const buyerGuid = params.buyerGuid?.trim();
  if (!buyerGuid) {
    return empty;
  }

  try {
    const inv = await getInventoryKPIs(
      buyerGuid,
      params.timezone,
      ["foodCostPercent"],
      "thisWeek",
      undefined,
      undefined,
      isExternalDataCacheReadEnabled() ? params.locationId : null,
    );
    const foodPct = inv.foodCostPercent ?? null;
    let foodCountPeriod: { start: string; end: string } | null = null;
    if (
      typeof inv.countPeriodStart === "string" &&
      inv.countPeriodStart.trim() &&
      typeof inv.countPeriodEnd === "string" &&
      inv.countPeriodEnd.trim()
    ) {
      foodCountPeriod = {
        start: inv.countPeriodStart.trim(),
        end: inv.countPeriodEnd.trim(),
      };
    }
    return { foodPct, foodCountPeriod };
  } catch (err) {
    logger.warn("[Alerts] Food cost KPI fetch failed", { locationId: params.locationId, err });
    return empty;
  }
}

function goalAlertValuesSnippet(params: {
  metricKey: FinancialMetricKeyForAlert;
  goalValue: number;
  actualValue: number;
}): string {
  const rows = buildFinancialKpiEmailRows(
    params.metricKey,
    params.goalValue,
    params.actualValue,
  );
  const goalRow = rows.find((r) => r.label.toLowerCase().startsWith("goal"))?.value;
  const currentRow = rows.find((r) => r.label.toLowerCase().startsWith("current"))?.value;
  if (!goalRow || !currentRow) return "";
  return ` Current: ${currentRow} · Goal: ${goalRow}.`;
}

export interface FinancialLaborAlertCheck {
  metricKey: FinancialMetricKey;
  key: string;
  severity: GoalAlertSeverity;
  warnType: NotificationType;
  critType: NotificationType;
  title: string;
  buildMessage: (sev: "warning" | "critical") => string;
  goalValue: number;
  actualValue: number;
}

type FinancialLaborChecksBuildContext = {
  full: SalesLaborKPIsData;
  g: IGoal;
  keysThisTick: readonly FinancialMetricKey[];
  storeName: string;
  financialLabor: IAlertNotificationSettings["financialLabor"];
  foodPct: number | null;
  foodCountPeriod: { start: string; end: string } | null;
  formatCountPeriodRange: (start: string, end: string) => string;
};

function pushSalesFinancialLaborCheck(
  checks: FinancialLaborAlertCheck[],
  ctx: FinancialLaborChecksBuildContext,
): void {
  const actualTotalSales = ctx.full.actualTotalSales;
  const sSales = classifyHigherIsBetter(
    actualTotalSales,
    ctx.g.salesGoal ?? 0,
    ctx.g.salesGoalTolerance ?? 0,
    ctx.financialLabor.sales,
  );
  if (!sSales || !ctx.keysThisTick.includes("sales") || actualTotalSales == null) {
    return;
  }
  checks.push({
    metricKey: "sales",
    key: "sales_goal",
    severity: sSales,
    warnType: "alert_goal_sales_warning",
    critType: "alert_goal_sales_critical",
    title: "Sales goal",
    buildMessage: (sev) => {
      const base =
        sev === "warning"
          ? `${ctx.storeName}: Net sales are below goal but within the tolerance band.`
          : `${ctx.storeName}: Net sales are below goal beyond tolerance.`;
      return (
        base +
        goalAlertValuesSnippet({
          metricKey: "sales",
          goalValue: ctx.g.salesGoal ?? 0,
          actualValue: actualTotalSales,
        })
      );
    },
    goalValue: ctx.g.salesGoal ?? 0,
    actualValue: actualTotalSales,
  });
}

function pushLaborFinancialLaborCheck(
  checks: FinancialLaborAlertCheck[],
  ctx: FinancialLaborChecksBuildContext,
): void {
  const actualLaborCostPercent = ctx.full.actualLaborCostPercent;
  const sLabor = classifyLowerIsBetter(
    actualLaborCostPercent,
    ctx.g.laborCostGoal ?? 0,
    ctx.g.laborCostGoalTolerance ?? 0,
    ctx.financialLabor.laborCostPct,
  );
  if (!sLabor || !ctx.keysThisTick.includes("laborCostPct") || actualLaborCostPercent == null) {
    return;
  }
  checks.push({
    metricKey: "laborCostPct",
    key: "labor_pct",
    severity: sLabor,
    warnType: "alert_goal_labor_pct_warning",
    critType: "alert_goal_labor_pct_critical",
    title: "Labor cost %",
    buildMessage: (sev) => {
      const base =
        sev === "warning"
          ? `${ctx.storeName}: Labor cost % is above goal but within tolerance.`
          : `${ctx.storeName}: Labor cost % is above goal beyond tolerance.`;
      return (
        base +
        goalAlertValuesSnippet({
          metricKey: "laborCostPct",
          goalValue: ctx.g.laborCostGoal ?? 0,
          actualValue: actualLaborCostPercent,
        })
      );
    },
    goalValue: ctx.g.laborCostGoal ?? 0,
    actualValue: actualLaborCostPercent,
  });
}

function pushHoursFinancialLaborCheck(
  checks: FinancialLaborAlertCheck[],
  ctx: FinancialLaborChecksBuildContext,
): void {
  const totalHours = ctx.full.totalHours;
  const sHours = classifyLowerIsBetter(
    totalHours,
    ctx.g.hoursGoal ?? 0,
    ctx.g.hoursGoalTolerance ?? 0,
    ctx.financialLabor.hours,
  );
  if (!sHours || !ctx.keysThisTick.includes("hours") || totalHours == null) {
    return;
  }
  checks.push({
    metricKey: "hours",
    key: "hours",
    severity: sHours,
    warnType: "alert_goal_hours_warning",
    critType: "alert_goal_hours_critical",
    title: "Hours goal",
    buildMessage: (sev) => {
      const base =
        sev === "warning"
          ? `${ctx.storeName}: Hours are above goal but within tolerance.`
          : `${ctx.storeName}: Hours are above goal beyond tolerance.`;
      return (
        base +
        goalAlertValuesSnippet({
          metricKey: "hours",
          goalValue: ctx.g.hoursGoal ?? 0,
          actualValue: totalHours,
        })
      );
    },
    goalValue: ctx.g.hoursGoal ?? 0,
    actualValue: totalHours,
  });
}

function pushSpmhFinancialLaborCheck(
  checks: FinancialLaborAlertCheck[],
  ctx: FinancialLaborChecksBuildContext,
): void {
  const salesPerManHour = ctx.full.salesPerManHour;
  const sSpmh = classifyHigherIsBetter(
    salesPerManHour,
    ctx.g.spmhGoal ?? 0,
    ctx.g.spmhGoalTolerance ?? 0,
    ctx.financialLabor.spmh,
  );
  if (!sSpmh || !ctx.keysThisTick.includes("spmh") || salesPerManHour == null) {
    return;
  }
  checks.push({
    metricKey: "spmh",
    key: "spmh",
    severity: sSpmh,
    warnType: "alert_goal_spmh_warning",
    critType: "alert_goal_spmh_critical",
    title: "SPMH goal",
    buildMessage: (sev) => {
      const base =
        sev === "warning"
          ? `${ctx.storeName}: SPMH is below goal but within tolerance.`
          : `${ctx.storeName}: SPMH is below goal beyond tolerance.`;
      return (
        base +
        goalAlertValuesSnippet({
          metricKey: "spmh",
          goalValue: ctx.g.spmhGoal ?? 0,
          actualValue: salesPerManHour,
        })
      );
    },
    goalValue: ctx.g.spmhGoal ?? 0,
    actualValue: salesPerManHour,
  });
}

function pushFoodCostFinancialLaborCheck(
  checks: FinancialLaborAlertCheck[],
  ctx: FinancialLaborChecksBuildContext,
): void {
  const foodPct = ctx.foodPct;
  const sFood = classifyLowerIsBetter(
    foodPct,
    ctx.g.foodCostGoal ?? 0,
    ctx.g.foodCostGoalTolerance ?? 0,
    ctx.financialLabor.foodCostPct,
  );
  if (!sFood || !ctx.keysThisTick.includes("foodCostPct") || foodPct == null) {
    return;
  }
  checks.push({
    metricKey: "foodCostPct",
    key: "food_cost",
    severity: sFood,
    warnType: "alert_goal_food_cost_warning",
    critType: "alert_goal_food_cost_critical",
    title: "Food cost %",
    buildMessage: (sev) => {
      const base =
        sev === "warning"
          ? `${ctx.storeName}: Food cost % is above goal but within tolerance.`
          : `${ctx.storeName}: Food cost % is above goal beyond tolerance.`;
      const withValues =
        base +
        goalAlertValuesSnippet({
          metricKey: "foodCostPct",
          goalValue: ctx.g.foodCostGoal ?? 0,
          actualValue: foodPct,
        });
      if (!ctx.foodCountPeriod) {
        return withValues;
      }
      return `${withValues} Count period: ${ctx.formatCountPeriodRange(
        ctx.foodCountPeriod.start,
        ctx.foodCountPeriod.end,
      )}.`;
    },
    goalValue: ctx.g.foodCostGoal ?? 0,
    actualValue: foodPct,
  });
}

export function buildFinancialLaborAlertChecks(
  ctx: FinancialLaborChecksBuildContext,
): FinancialLaborAlertCheck[] {
  const checks: FinancialLaborAlertCheck[] = [];
  pushSalesFinancialLaborCheck(checks, ctx);
  pushLaborFinancialLaborCheck(checks, ctx);
  pushHoursFinancialLaborCheck(checks, ctx);
  pushSpmhFinancialLaborCheck(checks, ctx);
  pushFoodCostFinancialLaborCheck(checks, ctx);
  return checks;
}

export function buildFinancialLaborAlertSendData(
  baseData: { locationName: string },
  check: FinancialLaborAlertCheck,
  foodCountPeriod: { start: string; end: string } | null,
): Record<string, unknown> {
  const countPeriodSlice =
    check.metricKey === "foodCostPct" && foodCountPeriod
      ? {
          countPeriodStart: foodCountPeriod.start,
          countPeriodEnd: foodCountPeriod.end,
        }
      : {};

  return {
    ...baseData,
    sourceKey: check.key,
    ...countPeriodSlice,
    financialKpiRows: buildFinancialKpiEmailRows(
      check.metricKey,
      check.goalValue,
      check.actualValue,
    ),
  };
}
