import { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import {
  SalesLaborKPICards,
  HourlyBreakdownCard,
  SourcesOfSalesCard,
  ClockedInStaffCard,
  DailyTargetsSectionCard,
} from '../../components/SalesLabor';
import type { SalesLaborKPIItem } from '../../components/SalesLabor';
import SalesAndLaborIcon from '@assets/icons/sales_and_labor.svg?react';
import DollarIcon from '@assets/icons/dollar.svg?react';
import ActualLaborCostIcon from '@assets/icons/actual_labor_cost.svg?react';
import TotalHoursIcon from '@assets/icons/total_hours.svg?react';
import SalesPerManHourIcon from '@assets/icons/sales_per_man_hour.svg?react';
import NoOfTransactionsIcon from '@assets/icons/no_of_transactions.svg?react';
import AverageCheckIcon from '@assets/icons/average_check.svg?react';
import TotalDiscountsIcon from '@assets/icons/total_discounts.svg?react';
import { commandCenterService, type SalesLaborKPIsData } from '../../services/commandCenter.service';
import type { RootState } from '../../store/store';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

const hourlyLabels = ['08 am', '09 am', '10 am', '11 am', '12 pm', '01 pm', '02 pm', '03 pm', '04 pm', '05 pm', '06 pm', '07 pm'];
const hourlySalesData = [120, 280, 420, 580, 720, 650, 480, 520, 610, 750, 680, 390];
const hourlyLaborCostData = [18, 19, 20, 21, 22, 23, 22, 21, 22, 23, 24, 22];

const clockedInStaffRows = [
  { name: 'Alex Jonson', role: 'Line Cook', clockIn: '10:00 am', currentHours: 6.5, status: 'On Clock' as const },
  { name: 'Kraven meachle', role: 'Prep Cook', clockIn: '8:00 am', currentHours: 6.5, status: 'On Break' as const },
  { name: 'Sarah Miller', role: 'Server', clockIn: '9:30 am', currentHours: 5, status: 'On Clock' as const },
  { name: 'James Wilson', role: 'Line Cook', clockIn: '11:00 am', currentHours: 4, status: 'On Clock' as const },
  { name: 'Emma Davis', role: 'Prep Cook', clockIn: '7:00 am', currentHours: 8, status: 'On Break' as const },
];

const dailyTargetsItems = [
  { label: 'Sales Target', actual: 9425, target: 9000, higherIsBetter: true, formatValue: (n: number) => `$${n.toLocaleString()}` },
  { label: 'Labor Cost %', actual: 22.3, target: 20, higherIsBetter: false, formatValue: (n: number) => `${n}%` },
  { label: 'Hours Target', actual: 122, target: 135, higherIsBetter: false },
  { label: 'SPMH Target', actual: 59.3, target: 66.67, higherIsBetter: true, formatValue: (n: number) => `$${n.toFixed(2)}` },
];

export const SalesLaborDetails = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [kpis, setKpis] = useState<SalesLaborKPIsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentLocation?._id) {
      setKpis(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    commandCenterService
      .getSalesLaborKPIs(currentLocation._id)
      .then(setKpis)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load Sales & Labor KPIs');
        setKpis(null);
      })
      .finally(() => setLoading(false));
  }, [currentLocation?._id]);

  const salesLaborKPIs = useMemo((): SalesLaborKPIItem[] => {
    const unavail = '—';
    const fmt = (n: number | null, asCurrency: boolean) =>
      n == null ? unavail : asCurrency ? formatCurrency(n) : String(n);
    const fmtPercent = (n: number | null) => (n == null ? unavail : `${Number(n.toFixed(1))}%`);
    const fmtWhole = (n: number | null) => (n == null ? unavail : String(Math.round(n)));
    const fmtHours = (n: number | null) => (n == null ? unavail : Number(n).toFixed(2));
    return [
      {
        title: 'Actual Total Sales',
        timePeriod: 'Today',
        value: fmt(kpis?.actualTotalSales ?? null, true),
        accentColor: 'green',
        rightIcon: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Actual Labor Cost %',
        timePeriod: 'Today',
        value: fmtPercent(kpis?.actualLaborCostPercent ?? null),
        accentColor: 'blue',
        rightIcon: <ActualLaborCostIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Total Hours',
        timePeriod: 'Today',
        value: fmtHours(kpis?.totalHours ?? null),
        accentColor: 'orange',
        rightIcon: <TotalHoursIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Sales Per Man Hour',
        timePeriod: 'Today',
        value: fmt(kpis?.salesPerManHour ?? null, true),
        accentColor: 'purple',
        rightIcon: <SalesPerManHourIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'No. of Transactions',
        timePeriod: 'Today',
        value: fmtWhole(kpis?.transactionCount ?? null),
        accentColor: 'gray',
        rightIcon: <NoOfTransactionsIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Average Check',
        timePeriod: 'Today',
        value: fmt(kpis?.averageCheck ?? null, true),
        accentColor: 'red',
        rightIcon: <AverageCheckIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Total Discounts',
        timePeriod: 'Today',
        value: fmt(kpis?.totalDiscounts ?? null, true),
        accentColor: 'azure',
        rightIcon: <TotalDiscountsIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Total Refunds',
        timePeriod: 'Today',
        value: fmt(kpis?.totalRefunds ?? null, true),
        accentColor: 'yellow',
        subtitle: '#Refunds',
        extra:
          typeof kpis?.totalRefundCount === 'number'
            ? String(kpis.totalRefundCount).padStart(2, '0')
            : undefined,
        extraClassName: 'bg-quaternary/20 text-primary',
      },
    ];
  }, [kpis]);

  const showContentLoader = loading && currentLocation?._id;

  return (
    <Layout>
      <div className={`p-6 min-h-[200px] ${showContentLoader ? 'flex flex-col flex-1 min-h-[calc(100vh-6rem)]' : ''}`}>
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <SalesAndLaborIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Sales & Labor Detail
          </h2>
        </div>

        {!currentLocation && (
          <p className="text-sm text-secondary mb-4">Select a location from the navbar to view Sales & Labor data.</p>
        )}
        {error && (
          <p className="text-sm text-negative mb-4" role="alert">{error}</p>
        )}

        {showContentLoader ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-primary" aria-busy="true">
            <Spinner size="xl" className="text-button-primary" />
            <span className="text-sm">Loading data…</span>
          </div>
        ) : (
          <>
            <SalesLaborKPICards items={salesLaborKPIs} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <HourlyBreakdownCard
                xAxisLabels={hourlyLabels}
                salesData={hourlySalesData}
                laborCostData={hourlyLaborCostData}
                height={280}
                className="lg:col-span-2"
              />
              <SourcesOfSalesCard
                totalSales={
                  kpis?.actualTotalSales != null
                    ? formatCurrency(kpis.actualTotalSales)
                    : '—'
                }
                segments={kpis?.sourcesOfSales ?? []}
                subtitle="Today"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <ClockedInStaffCard rows={clockedInStaffRows} className="lg:col-span-2" />
              <DailyTargetsSectionCard items={dailyTargetsItems} />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};
