import type { ReactNode } from "react";
import {
  isCommandCenterKPIsDual,
  type CommandCenterKPIsData,
  type CommandCenterKPIsDataDual,
  type CommandCenterKPIsTodaySlice,
  type CommandCenterKPIsWeekToDateSlice,
} from "../services/commandCenter.service";
import type {
  CommandCenterKPIItem,
  CommandCenterKPIPeriod,
  ReviewRatingKPIPeriod,
} from "../components/CommandCenter";
import { formatCurrency } from "./commandCenterHelpers";
import {
  formatStarRating,
  reviewRatingPeriodLabel,
  reviewRatingSubtitle,
} from "./reviewRatingDisplayHelpers";

const REVIEW_RATING_PERIOD_OPTIONS: {
  value: ReviewRatingKPIPeriod;
  label: string;
}[] = [
  { value: "today", label: "Today" },
  { value: "weekToDate", label: "Week to date" },
  { value: "overall", label: "Overall" },
];

type KPIsInput = CommandCenterKPIsData | CommandCenterKPIsDataDual | null;

function timePeriodLabel(period: CommandCenterKPIPeriod): string {
  return period === "weekToDate" ? "Week to date" : "Today";
}

function getRawForPeriod<T>(
  period: CommandCenterKPIPeriod,
  todayVal: T | undefined,
  wtdVal: T | undefined,
): T | undefined {
  if (period === "weekToDate") return wtdVal;
  return todayVal;
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
  todaySlice: CommandCenterKPIsTodaySlice | undefined,
  wtdSlice: CommandCenterKPIsWeekToDateSlice | undefined,
  loading: boolean,
): string {
  const raw = getRawForPeriod(
    period,
    todaySlice?.netSalesToday,
    wtdSlice?.netSalesWeekToDate,
  );
  return formatRawCurrency(raw, loading);
}

function getLaborCostValue(
  period: CommandCenterKPIPeriod,
  todaySlice: CommandCenterKPIsTodaySlice | undefined,
  wtdSlice: CommandCenterKPIsWeekToDateSlice | undefined,
  loading: boolean,
): string {
  const raw = getRawForPeriod(
    period,
    todaySlice?.laborCostToday,
    wtdSlice?.laborCostWeekToDate,
  );
  return formatRawCurrency(raw, loading);
}

function getReviewRatingValue(
  period: ReviewRatingKPIPeriod,
  todaySlice: CommandCenterKPIsTodaySlice | undefined,
  wtdSlice: CommandCenterKPIsWeekToDateSlice | undefined,
): string {
  if (period === "overall") {
    const slice = todaySlice ?? wtdSlice;
    return formatStarRating(slice?.reviewRatingOverall);
  }
  const slice = period === "weekToDate" ? wtdSlice : todaySlice;
  return formatStarRating(slice?.reviewRating);
}

function getReviewCountStr(
  period: ReviewRatingKPIPeriod,
  todaySlice: CommandCenterKPIsTodaySlice | undefined,
  wtdSlice: CommandCenterKPIsWeekToDateSlice | undefined,
): string {
  if (period === "overall") {
    const slice = todaySlice ?? wtdSlice;
    if (slice?.reviewCountOverall != null)
      return `${slice.reviewCountOverall} Reviews`;
    return "— Reviews";
  }
  const slice = period === "weekToDate" ? wtdSlice : todaySlice;
  if (slice?.reviewCount != null) return `${slice.reviewCount} Reviews`;
  return "— Reviews";
}

function getReviewRatingRaw(
  period: ReviewRatingKPIPeriod,
  todaySlice: CommandCenterKPIsTodaySlice | undefined,
  wtdSlice: CommandCenterKPIsWeekToDateSlice | undefined,
): number | null | undefined {
  if (period === "overall") {
    return (todaySlice ?? wtdSlice)?.reviewRatingOverall;
  }
  const slice = period === "weekToDate" ? wtdSlice : todaySlice;
  return slice?.reviewRating;
}

function getRawNetSales(
  period: CommandCenterKPIPeriod,
  todaySlice: CommandCenterKPIsTodaySlice | undefined,
  wtdSlice: CommandCenterKPIsWeekToDateSlice | undefined,
): number | null | undefined {
  return getRawForPeriod(
    period,
    todaySlice?.netSalesToday,
    wtdSlice?.netSalesWeekToDate,
  );
}

function getRawLaborCost(
  period: CommandCenterKPIPeriod,
  todaySlice: CommandCenterKPIsTodaySlice | undefined,
  wtdSlice: CommandCenterKPIsWeekToDateSlice | undefined,
): number | null | undefined {
  return getRawForPeriod(
    period,
    todaySlice?.laborCostToday,
    wtdSlice?.laborCostWeekToDate,
  );
}

export interface CommandCenterKpiBuilderIcons {
  dollar: ReactNode;
  laborCost: ReactNode;
  /** Used for title and subtitle in Review Rating card (same icon, may differ by size) */
  starTitle: ReactNode;
  starSubtitle: ReactNode;
}

export interface BuildCommandCenterKPIItemsParams {
  kpis: KPIsInput;
  loading: boolean;
  canNetSales: boolean;
  canLaborCost: boolean;
  canReviewRating: boolean;
  netSalesPeriod: CommandCenterKPIPeriod;
  laborCostPeriod: CommandCenterKPIPeriod;
  reviewRatingPeriod: ReviewRatingKPIPeriod;
  setNetSalesPeriod: (p: CommandCenterKPIPeriod) => void;
  setLaborCostPeriod: (p: CommandCenterKPIPeriod) => void;
  setReviewRatingPeriod: (p: ReviewRatingKPIPeriod) => void;
  icons: CommandCenterKpiBuilderIcons;
}

interface SliceContext {
  todaySlice: CommandCenterKPIsTodaySlice | undefined;
  wtdSlice: CommandCenterKPIsWeekToDateSlice | undefined;
  isDual: boolean;
  loading: boolean;
}

function buildNetSalesItem(
  ctx: SliceContext,
  period: CommandCenterKPIPeriod,
  setPeriod: (p: CommandCenterKPIPeriod) => void,
  rightIcon: ReactNode,
): CommandCenterKPIItem {
  const raw = getRawNetSales(period, ctx.todaySlice, ctx.wtdSlice);
  return {
    title: "Net Sales",
    timePeriod: ctx.loading ? undefined : timePeriodLabel(period),
    value: getNetSalesValue(period, ctx.todaySlice, ctx.wtdSlice, ctx.loading),
    accentColor: "green",
    valueClassName: raw == null ? undefined : "text-secondary",
    rightIcon,
    loading: ctx.loading,
    ...(ctx.isDual && {
      period,
      onPeriodChange: (p) => setPeriod(p as CommandCenterKPIPeriod),
    }),
  };
}

function buildLaborCostItem(
  ctx: SliceContext,
  period: CommandCenterKPIPeriod,
  setPeriod: (p: CommandCenterKPIPeriod) => void,
  rightIcon: ReactNode,
): CommandCenterKPIItem {
  const raw = getRawLaborCost(period, ctx.todaySlice, ctx.wtdSlice);
  return {
    title: "Labor Cost",
    timePeriod: ctx.loading ? undefined : timePeriodLabel(period),
    value: getLaborCostValue(period, ctx.todaySlice, ctx.wtdSlice, ctx.loading),
    accentColor: "blue",
    valueClassName: raw == null ? undefined : "text-secondary",
    rightIcon,
    loading: ctx.loading,
    ...(ctx.isDual && {
      period,
      onPeriodChange: (p) => setPeriod(p as CommandCenterKPIPeriod),
    }),
  };
}

function buildReviewRatingItem(
  ctx: SliceContext,
  period: ReviewRatingKPIPeriod,
  setPeriod: (p: ReviewRatingKPIPeriod) => void,
  starSubtitle: ReactNode,
): CommandCenterKPIItem {
  const raw = getReviewRatingRaw(period, ctx.todaySlice, ctx.wtdSlice);
  return {
    title: "Review Rating",
    timePeriod: ctx.loading ? undefined : reviewRatingPeriodLabel(period),
    value: getReviewRatingValue(period, ctx.todaySlice, ctx.wtdSlice),
    accentColor: "gold" as const,
    subtitle: reviewRatingSubtitle(raw),
    subtitleIcon: starSubtitle,
    extra: getReviewCountStr(period, ctx.todaySlice, ctx.wtdSlice),
    extraClassName: "bg-[rgba(253,185,14,0.2)] px-4",
    loading: ctx.loading,
    period,
    onPeriodChange: (p) => setPeriod(p as ReviewRatingKPIPeriod),
    periodOptions: REVIEW_RATING_PERIOD_OPTIONS,
  };
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
    netSalesPeriod,
    laborCostPeriod,
    reviewRatingPeriod,
    setNetSalesPeriod,
    setLaborCostPeriod,
    setReviewRatingPeriod,
    icons,
  } = params;

  const isDual = kpis != null && isCommandCenterKPIsDual(kpis);
  const todaySlice: CommandCenterKPIsTodaySlice | undefined = isDual
    ? kpis.today
    : (kpis ?? undefined);
  const wtdSlice: CommandCenterKPIsWeekToDateSlice | undefined = isDual
    ? kpis.weekToDate
    : undefined;
  const ctx: SliceContext = { todaySlice, wtdSlice, isDual, loading };

  const items: CommandCenterKPIItem[] = [];
  if (canNetSales) {
    items.push(
      buildNetSalesItem(ctx, netSalesPeriod, setNetSalesPeriod, icons.dollar),
    );
  }
  if (canLaborCost) {
    items.push(
      buildLaborCostItem(
        ctx,
        laborCostPeriod,
        setLaborCostPeriod,
        icons.laborCost,
      ),
    );
  }
  if (canReviewRating) {
    items.push(
      buildReviewRatingItem(
        ctx,
        reviewRatingPeriod,
        setReviewRatingPeriod,
        icons.starTitle,
      ),
    );
  }
  return items;
}
