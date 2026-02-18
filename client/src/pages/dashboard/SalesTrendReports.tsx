import { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Layout } from '../../components/common/Layout';
import {
  SalesTrendChartCard,
  PeriodPicker,
  ComparisonPeriodPicker,
  getComparisonOptionsForPeriod,
  KPIsTableCard,
  SalesByCategoryCard,
  type PeriodPickerValue,
  type ComparisonPeriodPickerValue,
} from '../../components/SalesTrend';
import SalesAndLaborIcon from '@assets/icons/sales_and_labor.svg?react';
import {
  commandCenterService,
  isSalesTrendStacked,
  type SalesTrendData,
  type SalesTrendMetric,
  type SalesTrendGroupBy,
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
      const n = comparison.comparisonType === 'year2Before' ? 2 : comparison.comparisonType === 'year3Before' ? 3 : 4;
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

type KpiRow = { label: string; current: string | number; previous: string | number; percent: number };

function getKpiRows(timeRange: string, comparison: string, _metric: string): KpiRow[] {
  if (timeRange === 'Last 30 Days' && comparison === 'vs. Last Year') {
    return [
      { label: 'Total Net Sales', current: '$224,095', previous: '$186,710', percent: 20 },
      { label: 'Total Transactions', current: '8,238', previous: '7,056', percent: 16.7 },
      { label: 'Average Check Size', current: '$26.10', previous: '$26.46', percent: -1.4 },
      { label: 'Average Daily Sales', current: '$7,470', previous: '$6,224', percent: 20.1 },
      { label: 'Sales Per Hour SPH', current: '$548', previous: '$569', percent: -3.7 },
    ];
  }
  return [
    { label: 'Total Net Sales', current: '$52,100', previous: '$48,200', percent: 8.1 },
    { label: 'Total Transactions', current: '1,892', previous: '1,756', percent: 7.8 },
    { label: 'Average Check Size', current: '$27.52', previous: '$27.44', percent: 0.3 },
    { label: 'Average Daily Sales', current: '$7,443', previous: '$6,886', percent: 8.1 },
    { label: 'Sales Per Hour SPH', current: '$542', previous: '$518', percent: 4.6 },
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

  const [kpiPeriod, setKpiPeriod] = useState('Last 30 Days');
  const [kpiComparison, setKpiComparison] = useState('vs. Last Year');
  const [categoryPeriod, setCategoryPeriod] = useState('Last 30 Days');
  const [categoryComparison, setCategoryComparison] = useState('vs. Last Year');

  const locationId = currentLocation?._id ?? null;

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
            <KPIsTableCard
              rows={getKpiRows(kpiPeriod, kpiComparison, metric)}
              title="KPIs"
              currentPeriodLabel={kpiPeriod}
              comparisonPeriodLabel={
                kpiComparison === 'vs. Last Year' ? 'Last Year' : kpiComparison
              }
              period={kpiPeriod}
              comparison={kpiComparison}
              onPeriodChange={setKpiPeriod}
              onComparisonChange={setKpiComparison}
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
