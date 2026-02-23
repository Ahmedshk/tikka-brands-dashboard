import { useEffect, useState, useMemo } from 'react';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import {
  CommandCenterKPICards,
  HourlySalesChartCard,
  LaborCostGaugeCard,
  AlertsCard,
} from '../../components/CommandCenter';
import CommandCenterIcon from '@assets/icons/command_center.svg?react';
import DollarIcon from '@assets/icons/dollar.svg?react';
import LaborCostIcon from '@assets/icons/actual_labor_cost.svg?react';
import StarIcon from '@assets/icons/star.svg?react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { commandCenterService, type HourlySalesRow } from '../../services/commandCenter.service';
import type { CommandCenterKPIItem } from '../../components/CommandCenter';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Convert "HH:00" or "HH:mm" to "12 am", "01 am", "12 pm", "01 pm", etc. */
function formatHourToAmPm(hourStr: string): string {
  const parts = hourStr.trim().split(':');
  const h = Number.parseInt(parts[0] ?? '0', 10) % 24;
  if (h === 0) return '12 am';
  if (h === 12) return '12 pm';
  if (h < 12) return `${String(h).padStart(2, '0')} am`;
  return `${String(h - 12).padStart(2, '0')} pm`;
}

export const CommandCenter = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [kpis, setKpis] = useState<Awaited<ReturnType<typeof commandCenterService.getKPIs>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hourlySales, setHourlySales] = useState<HourlySalesRow[] | null>(null);
  const [hourlySalesLoading, setHourlySalesLoading] = useState(false);
  const [hourlySalesError, setHourlySalesError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentLocation?._id) {
      setKpis(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    commandCenterService
      .getKPIs(currentLocation._id)
      .then(setKpis)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load KPIs'))
      .finally(() => setLoading(false));
  }, [currentLocation?._id]);

  useEffect(() => {
    if (!currentLocation?._id) {
      setHourlySales(null);
      setHourlySalesError(null);
      return;
    }
    setHourlySalesLoading(true);
    setHourlySalesError(null);
    commandCenterService
      .getHourlySales(currentLocation._id)
      .then(setHourlySales)
      .catch((err) => {
        setHourlySalesError(err instanceof Error ? err.message : 'Failed to load hourly sales');
        setHourlySales(null);
      })
      .finally(() => setHourlySalesLoading(false));
  }, [currentLocation?._id]);

  const commandCenterKPIs = useMemo((): CommandCenterKPIItem[] => {
    const netSalesValue = kpis?.netSalesToday != null
      ? formatCurrency(kpis.netSalesToday)
      : (loading ? '…' : 'Unavailable');

    const laborCostValue = kpis?.laborCostToday != null
      ? formatCurrency(kpis.laborCostToday)
      : (loading ? '…' : 'Unavailable');

    return [
      {
        title: 'Net Sales',
        timePeriod: 'Today',
        value: netSalesValue,
        accentColor: "green",
        valueClassName: kpis?.netSalesToday != null ? 'text-secondary' : undefined,
        rightIcon: <DollarIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Labor Cost',
        timePeriod: 'Today',
        value: laborCostValue,
        accentColor: 'blue',
        valueClassName: kpis?.laborCostToday != null ? 'text-secondary' : undefined,
        rightIcon: <LaborCostIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      },
      {
        title: 'Review Rating',
        timePeriod: 'Today',
        value: '4.3',
        accentColor: 'gold' as const,
        titleIcon: <StarIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-quaternary" aria-hidden />,
        subtitle: 'Good',
        subtitleIcon: <StarIcon className="w-4 h-4 md:w-4 md:h-4 2xl:w-5 2xl:h-5 text-quaternary" aria-hidden />,
        extra: '272 Reviews',
        extraClassName: 'bg-[rgba(253,185,14,0.2)] px-4',
      },
    ];
  }, [kpis, loading]);

  const hourlyChartData = useMemo(() => {
    if (hourlySales && hourlySales.length > 0) {
      return {
        xAxisData: hourlySales.map((r) => formatHourToAmPm(r.hour)),
        series: [
          { id: 'lastWeek', label: 'Last Week', data: hourlySales.map((r) => r.last_week) },
          { id: 'today', label: 'Today', data: hourlySales.map((r) => r.today) },
        ],
      };
    }
    const emptyHours = Array.from({ length: 24 }, (_, h) =>
      formatHourToAmPm(`${String(h).padStart(2, '0')}:00`)
    );
    return {
      xAxisData: emptyHours,
      series: [
        { id: 'lastWeek', label: 'Last Week', data: emptyHours.map(() => 0) },
        { id: 'today', label: 'Today', data: emptyHours.map(() => null) },
      ],
    };
  }, [hourlySales]);

  const showContentLoader = loading && currentLocation?._id;

  return (
    <Layout>
      <div className={`p-6 min-h-[200px] ${showContentLoader ? 'flex flex-col flex-1 min-h-[calc(100vh-6rem)]' : ''}`}>
        {showContentLoader ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-primary" aria-busy="true">
            <Spinner size="xl" className="text-button-primary" />
            <span className="text-sm">Loading data…</span>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
                <CommandCenterIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
                Command Center
              </h2>
            </div>

            {!currentLocation && (
              <p className="text-sm text-secondary mb-4">Select a location from the navbar to view KPIs.</p>
            )}
            {error && (
              <p className="text-sm text-negative mb-4" role="alert">{error}</p>
            )}

            <CommandCenterKPICards items={commandCenterKPIs} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <HourlySalesChartCard
                xAxisData={hourlyChartData.xAxisData}
                series={hourlyChartData.series}
                height={256}
                className="lg:col-span-2"
                yAxis={{ valueFormatter: (v) => formatCurrency(Number(v)) }}
                loading={hourlySalesLoading}
                error={hourlySalesError}
              />
              <LaborCostGaugeCard
                value={kpis?.laborCostPercentToday ?? 0}
                goal={kpis?.laborCostGoal ?? null}
                subtitle="Labor Cost as % of Net Sales"
                overTarget={
                  kpis?.laborCostPercentToday != null && kpis?.laborCostGoal != null
                    ? kpis.laborCostPercentToday - kpis.laborCostGoal
                    : null
                }
                size={340}
              />
            </div>

            <AlertsCard />
          </>
        )}
      </div>
    </Layout>
  );
};
