import { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Layout } from '../../components/common/Layout';
import { format, parse } from 'date-fns';
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
} from '../../services/commandCenter.service';
import type { TimeSeriesSeries } from '../../components/charts/TimeSeriesLineChart';
import type { RootState } from '../../store/store';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

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

function percentDiff(current: number, comparison: number): number {
  if (comparison === 0) return 0;
  return Number((((current - comparison) / comparison) * 100).toFixed(1));
}

function getKpiPeriodLabel(value: PeriodPickerValue): string {
  if (value.periodType === 'custom' && value.periodStart && value.periodEnd) {
    try {
      const s = format(parse(value.periodStart, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
      const e = format(parse(value.periodEnd, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
      return s === e ? s : `${s} – ${e}`;
    } catch {
      return 'Custom';
    }
  }
  return PERIOD_OPTIONS.find((o) => o.value === value.periodType)?.label ?? 'Period';
}

function getKpiComparisonLabel(periodType: PeriodPickerValue['periodType'], value: ComparisonPeriodPickerValue): string {
  if (value.comparisonType === 'custom' && value.comparisonStart && value.comparisonEnd) {
    try {
      const s = format(parse(value.comparisonStart, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
      const e = format(parse(value.comparisonEnd, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy');
      return s === e ? s : `${s} – ${e}`;
    } catch {
      return 'Comparison';
    }
  }
  const opts = getComparisonOptionsForPeriod(periodType);
  return opts.find((o) => o.value === value.comparisonType)?.label ?? 'Comparison';
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

function getSalesByCategoryItems(
  timeRange: string,
  comparison: string
): { label: string; currentValue: number; comparisonValue: number }[] {
  if (timeRange === 'Last 30 Days' && comparison === 'vs. Last Year') {
    return [
      { label: 'Food', currentValue: 187424, comparisonValue: 157424 },
      { label: 'Beverages', currentValue: 48980, comparisonValue: 51700 },
      { label: 'Merchandise', currentValue: 17691, comparisonValue: 14890 },
      { label: 'Catering', currentValue: 12500, comparisonValue: 9800 },
      { label: 'Retail', currentValue: 8450, comparisonValue: 7200 },
      { label: 'Other', currentValue: 4100, comparisonValue: 3500 },
    ];
  }
  return [
    { label: 'Food', currentValue: 43200, comparisonValue: 40100 },
    { label: 'Beverages', currentValue: 11200, comparisonValue: 10800 },
    { label: 'Merchandise', currentValue: 4100, comparisonValue: 3900 },
    { label: 'Catering', currentValue: 3200, comparisonValue: 2900 },
    { label: 'Retail', currentValue: 2100, comparisonValue: 1900 },
    { label: 'Other', currentValue: 600, comparisonValue: 500 },
  ];
}

const defaultPeriod: PeriodPickerValue = {
  periodType: 'last30days',
};

const defaultComparison: ComparisonPeriodPickerValue = {
  comparisonType: 'priorYear',
};

export const SalesTrendReports = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [period, setPeriod] = useState<PeriodPickerValue>(defaultPeriod);
  const [comparison, setComparison] = useState<ComparisonPeriodPickerValue>(defaultComparison);
  const [metric, setMetric] = useState<SalesTrendMetric>('netSales');
  const [groupBy, setGroupBy] = useState<SalesTrendGroupBy>('none');
  const [trendData, setTrendData] = useState<SalesTrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kpiPeriod, setKpiPeriod] = useState<PeriodPickerValue>({ periodType: 'last30days' });
  const [kpiComparison, setKpiComparison] = useState<ComparisonPeriodPickerValue>({ comparisonType: 'priorYear' });
  const [kpiData, setKpiData] = useState<SalesTrendKpiData | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [categoryPeriod, setCategoryPeriod] = useState('Last 30 Days');
  const [categoryComparison, setCategoryComparison] = useState('vs. Last Year');

  const locationId = currentLocation?._id ?? null;

  useEffect(() => {
    const options = getComparisonOptionsForPeriod(kpiPeriod.periodType).filter((o) => o.value !== 'none');
    const exists = options.some((o) => o.value === kpiComparison.comparisonType);
    if (!exists && options.length > 0) {
      const fallback = kpiPeriod.periodType === 'thisYear' ? 'priorYear' : options[0].value;
      setKpiComparison((prev) =>
        fallback === 'custom'
          ? { comparisonType: 'custom' }
          : { ...prev, comparisonType: fallback as ComparisonPeriodPickerValue['comparisonType'] }
      );
    }
  }, [kpiPeriod.periodType]);

  useEffect(() => {
    const options = getComparisonOptionsForPeriod(period.periodType);
    const exists = options.some((o) => o.value === comparison.comparisonType);
    if (!exists && options.length > 0) {
      const fallback =
        period.periodType === 'thisYear'
          ? 'priorYear'
          : options[0].value;
      const next: ComparisonPeriodPickerValue =
        fallback === 'custom'
          ? { comparisonType: fallback }
          : { comparisonType: fallback, comparisonStart: undefined, comparisonEnd: undefined };
      setComparison(next);
    }
  }, [period.periodType]);

  useEffect(() => {
    if (!locationId) {
      setTrendData(null);
      setError(null);
      return;
    }
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
      .getSalesTrend(locationId, params)
      .then(setTrendData)
      .catch((err: unknown) => {
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
      .finally(() => setLoading(false));
  }, [
    locationId,
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
    if (!locationId) {
      setKpiData(null);
      setKpiError(null);
      return;
    }
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
      .getSalesTrendKpi(locationId, kpiParams)
      .then(setKpiData)
      .catch((err: unknown) => {
        const res = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        let message = 'Failed to load KPIs';
        if (typeof res === 'string' && res.trim()) message = res;
        else if (err instanceof Error) message = err.message;
        setKpiError(message);
        setKpiData(null);
      })
      .finally(() => setKpiLoading(false));
  }, [
    locationId,
    kpiPeriod.periodType,
    kpiPeriod.periodStart,
    kpiPeriod.periodEnd,
    kpiComparison.comparisonType,
    kpiComparison.comparisonStart,
    kpiComparison.comparisonEnd,
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
    const comparisonSeries: TimeSeriesSeries = {
      id: 'comparison',
      label: getComparisonLabel(comparison),
      data: trendData.comparisonPeriod,
      color: '#9ca3af',
    };
    return {
      variant: 'line' as const,
      xAxisData,
      series: [comparisonSeries, currentSeries],
      yAxis,
    };
  }, [trendData, metric, comparison]);

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
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label htmlFor="metric" className="text-xs md:text-sm text-secondary">
                Metric:
              </label>
              <select
                id="metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value as SalesTrendMetric)}
                className={selectClass}
              >
                {METRIC_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="period" className="text-xs md:text-sm text-secondary">
                Period:
              </label>
              <PeriodPicker
                id="period"
                value={period}
                onChange={setPeriod}
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
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm">{error}</div>
        )}

        {locationId && (
          <SalesTrendChartCard
            loading={loading}
            xAxisData={chartProps?.xAxisData ?? []}
            series={chartProps?.series ?? []}
            variant={chartProps?.variant ?? 'line'}
            showGroupBy={metric === 'netSales'}
            groupBy={groupBy}
            onGroupByChange={(v) => setGroupBy(v as SalesTrendGroupBy)}
            yAxis={chartProps?.yAxis}
            height={280}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              comparisonPeriodLabel={getKpiComparisonLabel(kpiPeriod.periodType, kpiComparison)}
              periodValue={kpiPeriod}
              comparisonValue={kpiComparison}
              onPeriodChange={setKpiPeriod}
              onComparisonChange={setKpiComparison}
              excludeNoneFromComparison
            />
          </div>
          <div className={cardClass}>
            <SalesByCategoryCard
              items={getSalesByCategoryItems(categoryPeriod, categoryComparison)}
              currentPeriodLabel={categoryPeriod}
              comparisonPeriodLabel={
                categoryComparison === 'vs. Last Year' ? 'Last Year' : categoryComparison
              }
              period={categoryPeriod}
              comparison={categoryComparison}
              onPeriodChange={setCategoryPeriod}
              onComparisonChange={setCategoryComparison}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
};
