import { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Layout } from '../../components/common/Layout';
import { Dropdown } from '../../components/common/Dropdown';
import { format, parse, differenceInCalendarDays } from 'date-fns';
import {
  SalesTrendChartCard,
  PeriodPicker,
  ComparisonPeriodPicker,
  getComparisonOptionsForPeriod,
  KPIsTableCard,
  PERIOD_OPTIONS,
  SalesByCategoryCard,
  type ComparisonPeriodPickerValue,
  type KPIsTableRow,
  type PeriodPickerValue,
} from '../../components/SalesTrend';
import SalesAndLaborIcon from '@assets/icons/sales_and_labor.svg?react';
import {
  commandCenterService,
  isSalesTrendStacked,
  type SalesTrendData,
  type SalesTrendMetric,
  type SalesTrendGroupBy,
  type SalesTrendKpiData,
  type SalesByCategoryData,
} from '../../services/commandCenter.service';
import type { TimeSeriesSeries } from '../../components/charts/TimeSeriesLineChart';
import type { RootState } from '../../store/store';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';
import {
  sumTimeSeriesDataPoints,
  computePeriodOverPeriodPercentChange,
  salesTrendLineChartPropsToLegendTotals,
} from '../../utils/salesTrendChartCardHelpers';

const PAGE_ID = 'sales-trend-reports';
const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) return err.name === 'CanceledError' || (err as { code?: string }).code === 'ERR_CANCELED';
  return false;
}

const METRIC_OPTIONS: { value: SalesTrendMetric; label: string }[] = [
  { value: 'netSales', label: 'Net Sales' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'averageCheck', label: 'Average Check' },
  { value: 'laborCost', label: 'Labor Cost' },
  { value: 'hours', label: 'Hours' },
];

function getComparisonLabel(comparison: ComparisonPeriodPickerValue): string {
  switch (comparison.comparisonType) {
    case 'priorYear':
      return 'Last year';
    case '1DayPrior':
      return 'Yesterday';
    case 'samePeriodPreviousWeek':
      return 'Previous week';
    case 'samePeriodPreviousMonth':
      return 'Previous month';
    case '52WeeksPrior':
      return '52 weeks prior';
    case 'year2Before':
    case 'year3Before':
    case 'year4Before': {
      let n = 4;
      if (comparison.comparisonType === 'year2Before') n = 2;
      else if (comparison.comparisonType === 'year3Before') n = 3;
      return `Year ${new Date().getFullYear() - n}`;
    }
    case 'custom':
      return 'Comparison';
    case 'none':
    default:
      return 'Comparison';
  }
}

function getYAxisFormatter(metric: SalesTrendMetric): (value: number) => string {
  switch (metric) {
    case 'netSales':
    case 'averageCheck':
    case 'laborCost':
      return (v) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(v);
    case 'transactions':
      return (v) => Math.round(v).toLocaleString();
    case 'hours':
      return (v) => Number(v).toFixed(2);
    default:
      return String;
  }
}

const currencyFmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/** Returns null when comparison is 0 and current > 0 (undefined % change); otherwise the percentage. */
function percentDiff(current: number, comparison: number): number | null {
  if (comparison === 0) return current > 0 ? null : 0;
  return Number((((current - comparison) / comparison) * 100).toFixed(1));
}

function getKpiPeriodLabel(value: PeriodPickerValue): string {
  if (value.periodType === 'custom' && value.periodStart && value.periodEnd) {
    try {
      const s = format(parse(value.periodStart, 'yyyy-MM-dd', new Date()), DATE_DISPLAY_FORMAT);
      const e = format(parse(value.periodEnd, 'yyyy-MM-dd', new Date()), DATE_DISPLAY_FORMAT);
      return s === e ? s : `${s} – ${e}`;
    } catch {
      return 'Custom';
    }
  }
  return PERIOD_OPTIONS.find((o) => o.value === value.periodType)?.label ?? 'Period';
}

function getKpiComparisonLabel(period: PeriodPickerValue, value: ComparisonPeriodPickerValue): string {
  if (value.comparisonType === 'custom' && value.comparisonStart && value.comparisonEnd) {
    try {
      const s = format(parse(value.comparisonStart, 'yyyy-MM-dd', new Date()), DATE_DISPLAY_FORMAT);
      const e = format(parse(value.comparisonEnd, 'yyyy-MM-dd', new Date()), DATE_DISPLAY_FORMAT);
      return s === e ? s : `${s} – ${e}`;
    } catch {
      return 'Comparison';
    }
  }
  const opts = getComparisonOptionsForPeriod(period.periodType, {
    customRangeDays: getCustomRangeDays(period),
  });
  return opts.find((o) => o.value === value.comparisonType)?.label ?? 'Comparison';
}

const DATE_DISPLAY_FORMAT = 'MM/dd/yy';

function getCustomRangeDays(period: PeriodPickerValue): number | undefined {
  if (period.periodType !== 'custom' || !period.periodStart || !period.periodEnd) return undefined;
  const s = parse(period.periodStart, 'yyyy-MM-dd', new Date());
  const e = parse(period.periodEnd, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return undefined;
  return differenceInCalendarDays(e, s);
}

/** Format a single ISO date in the given timezone as MM/dd/yy. */
function formatDateInTz(iso: string, timezone: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).format(d);
}

/** Calendar date YYYY-MM-DD in the given timezone (for same-day check). */
function getCalendarDateInTz(iso: string, timezone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Format ISO range for display in location timezone: single date if same calendar day, else "Start – End". Uses MM/dd/yy. */
function formatDateRange(startAt: string, endAt: string, locationTimezone?: string | null): string {
  try {
    const tz = (locationTimezone ?? '').trim() || undefined;
    if (tz) {
      const startDate = getCalendarDateInTz(startAt, tz);
      const endDate = getCalendarDateInTz(endAt, tz);
      const s = formatDateInTz(startAt, tz);
      const e = formatDateInTz(endAt, tz);
      return startDate === endDate ? s : `${s} – ${e}`;
    }
    const start = new Date(startAt);
    const end = new Date(endAt);
    const s = format(start, DATE_DISPLAY_FORMAT);
    const e = format(end, DATE_DISPLAY_FORMAT);
    return s === e ? s : `${s} – ${e}`;
  } catch {
    return '';
  }
}

function buildKpiRows(data: SalesTrendKpiData | null): KPIsTableRow[] {
  if (!data) return [];
  const { current, comparison } = data;

  const avgCheckCur = current.totalTransactions > 0 ? current.totalNetSales / current.totalTransactions : 0;
  const avgCheckComp = comparison.totalTransactions > 0 ? comparison.totalNetSales / comparison.totalTransactions : 0;
  const avgDailyCur = current.numDays > 0 ? current.totalNetSales / current.numDays : 0;
  const avgDailyComp = comparison.numDays > 0 ? comparison.totalNetSales / comparison.numDays : 0;
  const sphCur = current.totalHours > 0 ? current.totalNetSales / current.totalHours : 0;
  const sphComp = comparison.totalHours > 0 ? comparison.totalNetSales / comparison.totalHours : 0;

  return [
    {
      label: 'Total Net Sales',
      current: currencyFmt(current.totalNetSales),
      previous: currencyFmt(comparison.totalNetSales),
      percent: percentDiff(current.totalNetSales, comparison.totalNetSales),
      tooltip: 'Sum of net sales in the period',
    },
    {
      label: 'Total Transactions',
      current: Math.round(current.totalTransactions).toLocaleString(),
      previous: Math.round(comparison.totalTransactions).toLocaleString(),
      percent: percentDiff(current.totalTransactions, comparison.totalTransactions),
      tooltip: 'Sum of transactions in the period',
    },
    {
      label: 'Average Check Size',
      current: avgCheckCur > 0 ? currencyFmt(avgCheckCur) : '—',
      previous: avgCheckComp > 0 ? currencyFmt(avgCheckComp) : '—',
      percent: percentDiff(avgCheckCur, avgCheckComp),
      tooltip: 'Total Net Sales / Total Transactions',
    },
    {
      label: 'Average Daily Sales',
      current: avgDailyCur > 0 ? currencyFmt(avgDailyCur) : '—',
      previous: avgDailyComp > 0 ? currencyFmt(avgDailyComp) : '—',
      percent: percentDiff(avgDailyCur, avgDailyComp),
      tooltip: 'Total Net Sales / Number of days in period',
    },
    {
      label: 'Average Sales Per Hour (SPH)',
      current: sphCur > 0 ? currencyFmt(sphCur) : '—',
      previous: sphComp > 0 ? currencyFmt(sphComp) : '—',
      percent: percentDiff(sphCur, sphComp),
      tooltip: 'Total Net Sales / Total hours in period',
    },
  ];
}

function buildCategoryItems(data: SalesByCategoryData | null): { label: string; currentValue: number; comparisonValue: number }[] {
  if (!data) return [];
  const currentByName = new Map(data.current.categories.map((c) => [c.label, c.netSales]));
  const comparisonByName = new Map(data.comparison.categories.map((c) => [c.label, c.netSales]));
  const allLabels = new Set([...currentByName.keys(), ...comparisonByName.keys()]);
  return Array.from(allLabels)
    .map((label) => ({
      label,
      currentValue: currentByName.get(label) ?? 0,
      comparisonValue: comparisonByName.get(label) ?? 0,
    }))
    .sort((a, b) => b.currentValue - a.currentValue);
}

const defaultPeriod: PeriodPickerValue = {
  periodType: 'today',
};

const defaultComparison: ComparisonPeriodPickerValue = {
  comparisonType: '1DayPrior',
};

export const SalesTrendReports = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const canTrendsChart = useCanAccessComponent(PAGE_ID, 'trends-chart');
  const canKpis = useCanAccessComponent(PAGE_ID, 'kpis');
  const canNetSalesByCategory = useCanAccessComponent(PAGE_ID, 'net-sales-by-category');

  const [period, setPeriod] = useState<PeriodPickerValue>(defaultPeriod);
  const [comparison, setComparison] = useState<ComparisonPeriodPickerValue>(defaultComparison);
  const [metric, setMetric] = useState<SalesTrendMetric>('netSales');
  const [groupBy, setGroupBy] = useState<SalesTrendGroupBy>('none');
  const [trendData, setTrendData] = useState<SalesTrendData | null>(null);
  const [loading, setLoading] = useState(!!currentLocation?._id && canTrendsChart);
  const [error, setError] = useState<string | null>(null);

  const [kpiPeriod, setKpiPeriod] = useState<PeriodPickerValue>({ periodType: 'today' });
  const [kpiComparison, setKpiComparison] = useState<ComparisonPeriodPickerValue>({ comparisonType: '1DayPrior' });
  const [kpiData, setKpiData] = useState<SalesTrendKpiData | null>(null);
  const [kpiLoading, setKpiLoading] = useState(!!currentLocation?._id && canKpis);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [categoryPeriod, setCategoryPeriod] = useState<PeriodPickerValue>(defaultPeriod);
  const [categoryComparison, setCategoryComparison] = useState<ComparisonPeriodPickerValue>(defaultComparison);
  const [categoryData, setCategoryData] = useState<SalesByCategoryData | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(!!currentLocation?._id && canNetSalesByCategory);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const locationId = currentLocation?._id ?? null;

  /** When KPI period changes, sync comparison in the same tick so only one API call is made. */
  const handleKpiPeriodChange = (newPeriod: PeriodPickerValue) => {
    setKpiPeriod(newPeriod);
    const options = getComparisonOptionsForPeriod(newPeriod.periodType, {
      customRangeDays: getCustomRangeDays(newPeriod),
    }).filter((o) => o.value !== 'none');
    const exists = options.some((o) => o.value === kpiComparison.comparisonType);
    if (!exists && options.length > 0) {
      const fallback = newPeriod.periodType === 'thisYear' ? 'priorYear' : (options[0]?.value ?? 'priorYear');
      setKpiComparison(
        fallback === 'custom'
          ? { comparisonType: 'custom' }
          : { comparisonType: fallback as ComparisonPeriodPickerValue['comparisonType'], comparisonStart: undefined, comparisonEnd: undefined }
      );
    }
  };

  /** When category period changes, sync comparison in the same tick so only one API call is made. */
  const handleCategoryPeriodChange = (newPeriod: PeriodPickerValue) => {
    setCategoryPeriod(newPeriod);
    const options = getComparisonOptionsForPeriod(newPeriod.periodType, {
      customRangeDays: getCustomRangeDays(newPeriod),
    }).filter((o) => o.value !== 'none');
    const exists = options.some((o) => o.value === categoryComparison.comparisonType);
    if (!exists && options.length > 0) {
      const fallback = newPeriod.periodType === 'thisYear' ? 'priorYear' : (options[0]?.value ?? 'priorYear');
      setCategoryComparison(
        fallback === 'custom'
          ? { comparisonType: 'custom' }
          : { comparisonType: fallback as ComparisonPeriodPickerValue['comparisonType'], comparisonStart: undefined, comparisonEnd: undefined }
      );
    }
  };

  /** When period changes, sync comparison to a valid option in the same tick so the trend effect runs once. */
  const handleTrendPeriodChange = (newPeriod: PeriodPickerValue) => {
    setPeriod(newPeriod);
    const options = getComparisonOptionsForPeriod(newPeriod.periodType, {
      customRangeDays: getCustomRangeDays(newPeriod),
    });
    const exists = options.some((o) => o.value === comparison.comparisonType);
    if (!exists && options.length > 0) {
      const fallback =
        newPeriod.periodType === 'thisYear'
          ? 'priorYear'
          : (options[0]?.value ?? 'priorYear');
      const next: ComparisonPeriodPickerValue =
        fallback === 'custom'
          ? { comparisonType: 'custom' }
          : { comparisonType: fallback, comparisonStart: undefined, comparisonEnd: undefined };
      setComparison(next);
    }
  };

  useEffect(() => {
    if (!locationId || !canTrendsChart) {
      setTrendData(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (period.periodType === 'custom' && (!period.periodStart || !period.periodEnd)) {
      setTrendData(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (comparison.comparisonType === 'custom' && (!comparison.comparisonStart || !comparison.comparisonEnd)) {
      setTrendData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let aborted = false;
    setLoading(true);
    setError(null);
    const params = {
      periodType: period.periodType,
      ...(period.periodType === 'custom' && {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      }),
      comparisonType: comparison.comparisonType,
      ...(comparison.comparisonType === 'custom' &&
        comparison.comparisonStart &&
        comparison.comparisonEnd && {
        comparisonStart: comparison.comparisonStart,
        comparisonEnd: comparison.comparisonEnd,
      }),
      metric,
      groupBy: metric === 'netSales' ? groupBy : ('none' as SalesTrendGroupBy),
    };
    commandCenterService
      .getSalesTrend(locationId, params, { signal: controller.signal })
      .then((data) => {
        if (!aborted) setTrendData(data);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) {
          aborted = true;
          return;
        }
        const res = (err as { response?: { data?: { message?: string } } })
          ?.response?.data?.message;
        let message = 'Failed to load sales trend';
        if (typeof res === 'string' && res.trim()) {
          message = res;
        } else if (err instanceof Error) {
          message = err.message;
        }
        setError(message);
        setTrendData(null);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
      controller.abort();
    };
  }, [
    locationId,
    canTrendsChart,
    period.periodType,
    period.periodStart,
    period.periodEnd,
    comparison.comparisonType,
    comparison.comparisonStart,
    comparison.comparisonEnd,
    metric,
    groupBy,
  ]);

  useEffect(() => {
    if (!locationId || !canKpis) {
      setKpiData(null);
      setKpiError(null);
      setKpiLoading(false);
      return;
    }
    if (kpiPeriod.periodType === 'custom' && (!kpiPeriod.periodStart || !kpiPeriod.periodEnd)) {
      setKpiData(null);
      setKpiError(null);
      setKpiLoading(false);
      return;
    }
    if (kpiComparison.comparisonType === 'custom' && (!kpiComparison.comparisonStart || !kpiComparison.comparisonEnd)) {
      setKpiData(null);
      setKpiError(null);
      setKpiLoading(false);
      return;
    }
    const controller = new AbortController();
    let aborted = false;
    setKpiLoading(true);
    setKpiError(null);
    const kpiParams = {
      periodType: kpiPeriod.periodType,
      ...(kpiPeriod.periodType === 'custom' &&
        kpiPeriod.periodStart &&
        kpiPeriod.periodEnd && {
        periodStart: kpiPeriod.periodStart,
        periodEnd: kpiPeriod.periodEnd,
      }),
      comparisonType: kpiComparison.comparisonType,
      ...(kpiComparison.comparisonType === 'custom' &&
        kpiComparison.comparisonStart &&
        kpiComparison.comparisonEnd && {
        comparisonStart: kpiComparison.comparisonStart,
        comparisonEnd: kpiComparison.comparisonEnd,
      }),
    };
    commandCenterService
      .getSalesTrendKpi(locationId, kpiParams, { signal: controller.signal })
      .then((data) => {
        if (!aborted) setKpiData(data);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) {
          aborted = true;
          return;
        }
        const res = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        let message = 'Failed to load KPIs';
        if (typeof res === 'string' && res.trim()) message = res;
        else if (err instanceof Error) message = err.message;
        setKpiError(message);
        setKpiData(null);
      })
      .finally(() => {
        if (!aborted) setKpiLoading(false);
      });
    return () => {
      aborted = true;
      controller.abort();
    };
  }, [
    locationId,
    canKpis,
    kpiPeriod.periodType,
    kpiPeriod.periodStart,
    kpiPeriod.periodEnd,
    kpiComparison.comparisonType,
    kpiComparison.comparisonStart,
    kpiComparison.comparisonEnd,
  ]);

  useEffect(() => {
    if (!locationId || !canNetSalesByCategory) {
      setCategoryData(null);
      setCategoryError(null);
      setCategoryLoading(false);
      return;
    }
    if (categoryPeriod.periodType === 'custom' && (!categoryPeriod.periodStart || !categoryPeriod.periodEnd)) {
      setCategoryData(null);
      setCategoryError(null);
      setCategoryLoading(false);
      return;
    }
    if (categoryComparison.comparisonType === 'custom' && (!categoryComparison.comparisonStart || !categoryComparison.comparisonEnd)) {
      setCategoryData(null);
      setCategoryError(null);
      setCategoryLoading(false);
      return;
    }
    const controller = new AbortController();
    let aborted = false;
    setCategoryLoading(true);
    setCategoryError(null);
    const categoryParams = {
      periodType: categoryPeriod.periodType,
      ...(categoryPeriod.periodType === 'custom' &&
        categoryPeriod.periodStart &&
        categoryPeriod.periodEnd && {
        periodStart: categoryPeriod.periodStart,
        periodEnd: categoryPeriod.periodEnd,
      }),
      comparisonType: categoryComparison.comparisonType,
      ...(categoryComparison.comparisonType === 'custom' &&
        categoryComparison.comparisonStart &&
        categoryComparison.comparisonEnd && {
        comparisonStart: categoryComparison.comparisonStart,
        comparisonEnd: categoryComparison.comparisonEnd,
      }),
    };
    commandCenterService
      .getSalesByCategory(locationId, categoryParams, { signal: controller.signal })
      .then((data) => {
        if (!aborted) setCategoryData(data);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) {
          aborted = true;
          return;
        }
        const res = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        let message = 'Failed to load sales by category';
        if (typeof res === 'string' && res.trim()) message = res;
        else if (err instanceof Error) message = err.message;
        setCategoryError(message);
        setCategoryData(null);
      })
      .finally(() => {
        if (!aborted) setCategoryLoading(false);
      });
    return () => {
      aborted = true;
      controller.abort();
    };
  }, [
    locationId,
    canNetSalesByCategory,
    categoryPeriod.periodType,
    categoryPeriod.periodStart,
    categoryPeriod.periodEnd,
    categoryComparison.comparisonType,
    categoryComparison.comparisonStart,
    categoryComparison.comparisonEnd,
  ]);

  const chartProps = useMemo(() => {
    if (!trendData) return null;
    const xAxisData = trendData.xAxisLabels;
    const valueFormatter = getYAxisFormatter(metric);
    const yAxis = { valueFormatter, min: 0 };

    if (isSalesTrendStacked(trendData)) {
      return {
        variant: 'stackedArea' as const,
        xAxisData,
        series: trendData.series.map((s) => ({
          id: s.id,
          label: s.label,
          data: s.data,
          color: s.color,
        })) as TimeSeriesSeries[],
        yAxis,
      };
    }
    const currentSeries: TimeSeriesSeries = {
      id: 'current',
      label: 'This period',
      data: trendData.currentPeriod,
      color: '#FBC52A',
    };
    const showComparison = comparison.comparisonType !== 'none';
    const comparisonSeries: TimeSeriesSeries = {
      id: 'comparison',
      label: getComparisonLabel(comparison),
      data: trendData.comparisonPeriod,
      color: '#9ca3af',
    };
    const currentTotal = sumTimeSeriesDataPoints(trendData.currentPeriod);
    const comparisonTotalPts = sumTimeSeriesDataPoints(trendData.comparisonPeriod);
    const lineLegend = showComparison
      ? {
          currentTotal,
          comparisonTotal: comparisonTotalPts,
          percentChange: computePeriodOverPeriodPercentChange(currentTotal, comparisonTotalPts),
        }
      : { currentTotal };
    return {
      variant: 'line' as const,
      xAxisData,
      series: showComparison
        ? [comparisonSeries, currentSeries]
        : [currentSeries],
      yAxis,
      lineLegend,
    };
  }, [trendData, metric, comparison]);

  const trendChartLegendTotals = salesTrendLineChartPropsToLegendTotals(chartProps);

  const categoryItems = useMemo(() => buildCategoryItems(categoryData), [categoryData]);
  const categoryTop5 = useMemo(() => categoryItems.slice(0, 5), [categoryItems]);

  const selectClass =
    'border border-gray-300 rounded-lg px-3 py-2 text-sm text-primary bg-white focus:outline-none focus:ring-2 focus:ring-quaternary/30';

  if (!currentLocation) {
    return (
      <Layout>
        <div className="p-6">
          <p className="text-secondary">Select a location to view Sales Trend Report.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary mb-4">
            <SalesAndLaborIcon
              className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary"
              aria-hidden
            />
            Sales Trend Report
          </h2>
          {canTrendsChart && (
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <label htmlFor="metric" className="text-xs md:text-sm text-secondary">
                  Metric:
                </label>
                <Dropdown
                  options={METRIC_OPTIONS}
                  value={metric}
                  onChange={(v) => setMetric(v as SalesTrendMetric)}
                  placeholder="Metric"
                  aria-label="Metric"
                  allowEmpty={false}
                  className="min-w-[9.5rem]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="period" className="text-xs md:text-sm text-secondary">
                  Period:
                </label>
                <PeriodPicker
                  id="period"
                  value={period}
                  onChange={handleTrendPeriodChange}
                  className={selectClass}
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="comparison" className="text-xs md:text-sm text-secondary">
                  Comparison:
                </label>
                <ComparisonPeriodPicker
                  id="comparison"
                  value={comparison}
                  onChange={setComparison}
                  period={period}
                  className={selectClass}
                />
              </div>
            </div>
          )}
        </div>

        {canTrendsChart && error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm">{error}</div>
        )}

        {canTrendsChart && locationId && (
          <SalesTrendChartCard
            loading={loading}
            title={`${METRIC_OPTIONS.find((o) => o.value === metric)?.label ?? 'Sales'} Trend`}
            xAxisData={chartProps?.xAxisData ?? []}
            series={chartProps?.series ?? []}
            variant={chartProps?.variant ?? 'line'}
            showGroupBy={metric === 'netSales'}
            groupBy={groupBy}
            onGroupByChange={(v) => setGroupBy(v as SalesTrendGroupBy)}
            yAxis={chartProps?.yAxis}
            height={280}
            periodDateRange={
              trendData && !isSalesTrendStacked(trendData) && trendData.periodRange
                ? formatDateRange(trendData.periodRange.startAt, trendData.periodRange.endAt, currentLocation?.timezone)
                : undefined
            }
            comparisonDateRange={
              trendData && !isSalesTrendStacked(trendData) && trendData.comparisonRange
                ? formatDateRange(trendData.comparisonRange.startAt, trendData.comparisonRange.endAt, currentLocation?.timezone)
                : undefined
            }
            legendValueFormatter={getYAxisFormatter(metric)}
            currentPeriodTotal={trendChartLegendTotals.currentPeriodTotal}
            comparisonPeriodTotal={trendChartLegendTotals.comparisonPeriodTotal}
            periodPercentChange={trendChartLegendTotals.periodPercentChange}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {canKpis && (
            <div className={cardClass}>
              {kpiError && (
                <div className="p-3 rounded-t-xl bg-red-50 text-red-800 text-sm border-b border-gray-200">
                  {kpiError}
                </div>
              )}
              <KPIsTableCard
                rows={buildKpiRows(kpiData)}
                loading={kpiLoading}
                title="KPIs"
                currentPeriodLabel={getKpiPeriodLabel(kpiPeriod)}
                comparisonPeriodLabel={getKpiComparisonLabel(kpiPeriod, kpiComparison)}
                currentPeriodDateRange={
                  kpiData?.periodRange
                    ? formatDateRange(kpiData.periodRange.startAt, kpiData.periodRange.endAt, currentLocation?.timezone)
                    : undefined
                }
                comparisonPeriodDateRange={
                  kpiData?.comparisonRange
                    ? formatDateRange(kpiData.comparisonRange.startAt, kpiData.comparisonRange.endAt, currentLocation?.timezone)
                    : undefined
                }
                periodValue={kpiPeriod}
                comparisonValue={kpiComparison}
                onPeriodChange={handleKpiPeriodChange}
                onComparisonChange={setKpiComparison}
                excludeNoneFromComparison
              />
            </div>
          )}
          {canNetSalesByCategory && (
            <div className={cardClass}>
              {categoryError && (
                <div className="p-3 rounded-t-xl bg-red-50 text-red-800 text-sm border-b border-gray-200">
                  {categoryError}
                </div>
              )}
              <SalesByCategoryCard
                items={categoryTop5}
                allItems={categoryItems}
                loading={categoryLoading}
                currentPeriodLabel={getKpiPeriodLabel(categoryPeriod)}
                comparisonPeriodLabel={getKpiComparisonLabel(categoryPeriod, categoryComparison)}
                periodValue={categoryPeriod}
                comparisonValue={categoryComparison}
                onPeriodChange={handleCategoryPeriodChange}
                onComparisonChange={setCategoryComparison}
                excludeNoneFromComparison
                periodDateRange={
                  categoryData?.periodRange
                    ? formatDateRange(categoryData.periodRange.startAt, categoryData.periodRange.endAt, currentLocation?.timezone)
                    : undefined
                }
                comparisonDateRange={
                  categoryData?.comparisonRange
                    ? formatDateRange(categoryData.comparisonRange.startAt, categoryData.comparisonRange.endAt, currentLocation?.timezone)
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
