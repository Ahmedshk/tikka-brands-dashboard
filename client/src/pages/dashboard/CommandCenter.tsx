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
import StarIcon from '@assets/icons/star.svg?react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store/store';
import { commandCenterService } from '../../services/commandCenter.service';
import type { CommandCenterKPIItem } from '../../components/CommandCenter';
import type { KPICardAccentColor } from '../../components/common/KPICard';

const hourlySalesXAxis = ['08 am', '11 am', '02 pm', '05 pm', '07 pm'];
const hourlySalesSeries = [
  { id: 'today', label: 'Today', data: [20, 100, 250, 450, 380], color: '#FBC52A' },
  { id: 'lastWeek', label: 'Last Week', data: [15, 85, 220, 400, 420], color: '#22C55E' },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
}

export const CommandCenter = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  const [kpis, setKpis] = useState<Awaited<ReturnType<typeof commandCenterService.getKPIs>> | null>(null);
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
      .getKPIs(currentLocation._id)
      .then(setKpis)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load KPIs'))
      .finally(() => setLoading(false));
  }, [currentLocation?._id]);

  const commandCenterKPIs = useMemo((): CommandCenterKPIItem[] => {
    const netSalesValue = kpis?.netSalesToday != null
      ? formatCurrency(kpis.netSalesToday)
      : (loading ? '…' : 'Unavailable');

    const laborPercentValue = kpis?.laborCostPercentToday != null
      ? `${kpis.laborCostPercentToday.toFixed(1)}%`
      : (loading ? '…' : 'Unavailable');
    const laborGoal = kpis?.laborCostGoal ?? 0;
    const laborPercent = kpis?.laborCostPercentToday ?? null;
    const hasLaborData = laborPercent != null;
    const isUnderGoal = hasLaborData && laborGoal != null && laborPercent < laborGoal;
    const isOverGoal = hasLaborData && laborGoal != null && laborPercent >= laborGoal;
    const laborBadge = hasLaborData ? `Goal ${laborGoal}%` : undefined;
    const laborValueClassName = isUnderGoal ? 'text-positive' : isOverGoal ? 'text-negative' : undefined;
    const laborBadgeClassName = isUnderGoal
      ? 'bg-positive/20 text-primary text-[10px] md:text-xs 2xl:text-sm px-4'
      : isOverGoal
        ? 'bg-negative/20 text-primary text-[10px] md:text-xs 2xl:text-sm px-4'
        : 'bg-gray-200 text-secondary text-[10px] md:text-xs 2xl:text-sm px-4';

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
        title: 'Labor Cost %',
        timePeriod: 'Today',
        value: laborPercentValue,
        accentColor: 'blue',
        valueClassName: laborValueClassName,
        badge: laborBadge,
        badgeClassName: laborBadgeClassName,
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
                xAxisData={hourlySalesXAxis}
                series={hourlySalesSeries}
                height={256}
                className="lg:col-span-2"
              />
              <LaborCostGaugeCard
                value={kpis?.laborCostPercentToday ?? 0}
                goal={kpis?.laborCostGoal ?? null}
                subtitle="Labor vs Goals"
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
