import { useId, useState, type ReactNode } from 'react';
import { KPICard } from '../common/KPICard';
import { Spinner } from '../common/Spinner';
import type { KPICardAccentColor } from '../common/KPICard';
import type { LocationListItem } from '../../types';
import type { CommandCenterLocationBreakdown } from '../../services/commandCenter.service';
import type { CommandCenterKPIPeriod } from '../../utils/commandCenterKpiPeriodHelpers';
import { buildCommandCenterKPIItems } from '../../utils/commandCenterKpiBuilder';
import { locationKpisForSelection } from '../../utils/commandCenterLocationKpis';

export interface CommandCenterKPIItem {
  title: string;
  timePeriod?: string;
  value: string;
  accentColor: KPICardAccentColor;
  rightIcon?: ReactNode;
  titleIcon?: ReactNode;
  valueClassName?: string;
  badge?: string;
  badgeClassName?: string;
  subtitle?: string;
  subtitleIcon?: ReactNode;
  extra?: string;
  extraClassName?: string;
  loading?: boolean;
}

export interface CommandCenterKPICardsProps {
  items: CommandCenterKPIItem[];
  locations?: LocationListItem[];
  period?: CommandCenterKPIPeriod;
  breakdown?: CommandCenterLocationBreakdown[];
  breakdownLoading?: boolean;
}

export const CommandCenterKPICards = ({ items, locations = [], period = 'today', breakdown = [], breakdownLoading = false }: CommandCenterKPICardsProps) => {
  const panelId = useId();
  const [expanded, setExpanded] = useState<string[]>([]);
  const canNetSales = items.some(item => item.title === 'Net Sales');
  const canLaborCost = items.some(item => item.title === 'Labor Cost');
  const canReviewRating = items.some(item => item.title === 'Review Rating');
  const ids = [...new Set(locations.map(location => location._id))];
  const currentDetails = locationKpisForSelection(breakdown, ids);

  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 overflow-visible ${locations.length > 0 ? 'items-start' : ''}`}>
      {items.map((kpi, index) => {
        const open = expanded.includes(kpi.title);
        const id = `${panelId}-${index}`;
        return (
          <KPICard key={kpi.title} {...kpi} titleRight={locations.length > 0 ? (
            <button type="button" className="inline-flex items-center gap-1 rounded-md p-1.5 text-[10px] 2xl:text-xs text-primary hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-button-primary"
              aria-expanded={open} aria-controls={id} aria-label={`${open ? 'Hide' : 'Show'} breakdown for ${kpi.title}`}
              onClick={() => setExpanded(previous => open ? previous.filter(title => title !== kpi.title) : [...previous, kpi.title])}>
              <span>{open ? 'Hide breakdown' : 'Show breakdown'}</span>
              <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="m6 9 6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : undefined}>
            <div id={id} hidden={!open}>
              {open && (
                <div className="mt-4 border-t border-gray-200 pt-3" aria-busy={breakdownLoading}>
                  <p className="text-xs font-semibold text-primary mb-2">By location</p>
                  <dl className="divide-y divide-gray-100">
                    {ids.map(locationId => {
                      const location = locations.find(location => location._id === locationId)!;
                      const result = currentDetails?.find(row => row.locationId === locationId);
                      const value = result ? buildCommandCenterKPIItems({
                        kpis: result.kpis, loading: breakdownLoading,
                        canNetSales, canLaborCost, canReviewRating, kpiPeriod: period,
                        icons: { dollar: null, laborCost: null, starTitle: null, starSubtitle: null },
                      }).find(item => item.title === kpi.title) : undefined;
                      return (
                        <div key={locationId} className="flex items-start justify-between gap-3 py-2 text-xs md:text-sm">
                          <dt className="min-w-0 text-primary break-words">{location.storeName}</dt>
                          <dd className="shrink-0 text-right text-secondary font-semibold">
                            {breakdownLoading ? (
                              <span className="inline-flex" role="status">
                                <Spinner size="sm" className="text-button-primary" />
                                <span className="sr-only">Loading {kpi.title} for {location.storeName}</span>
                              </span>
                            ) : value?.value ?? 'Unavailable'}
                            {kpi.title === 'Review Rating' && !breakdownLoading && value?.extra &&
                              <span className="block text-[10px] md:text-xs text-primary font-normal">{value.extra}</span>}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              )}
            </div>
          </KPICard>
        );
      })}
    </div>
  );
};
