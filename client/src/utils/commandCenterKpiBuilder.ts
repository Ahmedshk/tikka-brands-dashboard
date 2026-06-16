import type { ReactNode } from "react";
import {
  isCommandCenterKPIsMulti,
  type CommandCenterKPIsData,
  type CommandCenterKPIsDataMulti,
  type CommandCenterKPIPeriodSlice,
} from "../services/commandCenter.service";
import type { CommandCenterKPIItem } from "../components/CommandCenter";
import type { CommandCenterKPIPeriod } from "./commandCenterKpiPeriodHelpers";
import { commandCenterKpiPeriodLabel } from "./commandCenterKpiPeriodHelpers";
import { formatCurrency } from "./commandCenterHelpers";
import {
  formatOverallRatingFooter,
  formatStarRating,
  reviewRatingSubtitle,
} from "./reviewRatingDisplayHelpers";

type KPIsInput = CommandCenterKPIsData | CommandCenterKPIsDataMulti | null;

function getSliceForPeriod(
  kpis: KPIsInput,
  period: CommandCenterKPIPeriod,
): CommandCenterKPIPeriodSlice | undefined {
  if (kpis == null) return undefined;
  if (isCommandCenterKPIsMulti(kpis)) {
    return kpis[period];
  }
  if (period === "today") {
    return kpis;
  }
  return undefined;
}

function getRawNetSales(
  period: CommandCenterKPIPeriod,
  slice: CommandCenterKPIPeriodSlice | undefined,
): number | null | undefined {
  if (slice == null) return undefined;
  switch (period) {
    case "today":
      return "netSalesToday" in slice ? slice.netSalesToday : undefined;
    case "weekToDate":
      return "netSalesWeekToDate" in slice ? slice.netSalesWeekToDate : undefined;
    case "monthToDate":
      return "netSalesMonthToDate" in slice ? slice.netSalesMonthToDate : undefined;
    case "lastWeek":
      return "netSalesLastWeek" in slice ? slice.netSalesLastWeek : undefined;
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

function getRawLaborCost(
  period: CommandCenterKPIPeriod,
  slice: CommandCenterKPIPeriodSlice | undefined,
): number | null | undefined {
  if (slice == null) return undefined;
  switch (period) {
    case "today":
      return "laborCostToday" in slice ? slice.laborCostToday : undefined;
    case "weekToDate":
      return "laborCostWeekToDate" in slice ? slice.laborCostWeekToDate : undefined;
    case "monthToDate":
      return "laborCostMonthToDate" in slice ? slice.laborCostMonthToDate : undefined;
    case "lastWeek":
      return "laborCostLastWeek" in slice ? slice.laborCostLastWeek : undefined;
    default: {
      const _exhaustive: never = period;
      return _exhaustive;
    }
  }
}

function formatRawCurrency(
  raw: number | null | undefined,
  loading: boolean,
): string {
  if (raw != null) return formatCurrency(raw);
  if (loading) return "…";
  return "Unavailable";
}

function getNetSalesValue(
  period: CommandCenterKPIPeriod,
  slice: CommandCenterKPIPeriodSlice | undefined,
  loading: boolean,
): string {
  return formatRawCurrency(getRawNetSales(period, slice), loading);
}

function getLaborCostValue(
  period: CommandCenterKPIPeriod,
  slice: CommandCenterKPIPeriodSlice | undefined,
  loading: boolean,
): string {
  return formatRawCurrency(getRawLaborCost(period, slice), loading);
}

function getReviewRatingValue(
  slice: CommandCenterKPIPeriodSlice | undefined,
): string {
  return formatStarRating(slice?.reviewRating);
}

function getReviewCountStr(
  slice: CommandCenterKPIPeriodSlice | undefined,
): string {
  if (slice?.reviewCount != null) return `${slice.reviewCount} Reviews`;
  return "— Reviews";
}

function getOverallFromSlice(
  slice: CommandCenterKPIPeriodSlice | undefined,
  kpis: KPIsInput,
): number | null | undefined {
  const source =
    slice ??
    (kpis != null && isCommandCenterKPIsMulti(kpis) ? kpis.today : kpis) ??
    undefined;
  return source?.reviewRatingOverall;
}

export interface CommandCenterKpiBuilderIcons {
  dollar: ReactNode;
  laborCost: ReactNode;
  starTitle: ReactNode;
  starSubtitle: ReactNode;
}

export interface BuildCommandCenterKPIItemsParams {
  kpis: KPIsInput;
  loading: boolean;
  canNetSales: boolean;
  canLaborCost: boolean;
  canReviewRating: boolean;
  kpiPeriod: CommandCenterKPIPeriod;
  icons: CommandCenterKpiBuilderIcons;
}

export function buildCommandCenterKPIItems(
  params: BuildCommandCenterKPIItemsParams,
): CommandCenterKPIItem[] {
  const {
    kpis,
    loading,
    canNetSales,
    canLaborCost,
    canReviewRating,
    kpiPeriod,
    icons,
  } = params;

  const slice = getSliceForPeriod(kpis, kpiPeriod);
  const periodLabel = loading ? undefined : commandCenterKpiPeriodLabel(kpiPeriod);
  const items: CommandCenterKPIItem[] = [];

  if (canNetSales) {
    const raw = getRawNetSales(kpiPeriod, slice);
    items.push({
      title: "Net Sales",
      timePeriod: periodLabel,
      value: getNetSalesValue(kpiPeriod, slice, loading),
      accentColor: "green",
      valueClassName: raw == null ? undefined : "text-secondary",
      rightIcon: icons.dollar,
      loading,
    });
  }

  if (canLaborCost) {
    const raw = getRawLaborCost(kpiPeriod, slice);
    items.push({
      title: "Labor Cost",
      timePeriod: periodLabel,
      value: getLaborCostValue(kpiPeriod, slice, loading),
      accentColor: "blue",
      valueClassName: raw == null ? undefined : "text-secondary",
      rightIcon: icons.laborCost,
      loading,
    });
  }

  if (canReviewRating) {
    const raw = slice?.reviewRating;
    const overall = getOverallFromSlice(slice, kpis);
    items.push({
      title: "Review Rating",
      timePeriod: periodLabel,
      value: getReviewRatingValue(slice),
      accentColor: "gold",
      subtitle: reviewRatingSubtitle(raw),
      subtitleIcon: icons.starSubtitle,
      valueFooter: formatOverallRatingFooter(overall),
      extra: getReviewCountStr(slice),
      extraClassName: "bg-[rgba(253,185,14,0.2)] px-4",
      loading,
    });
  }

  return items;
}
