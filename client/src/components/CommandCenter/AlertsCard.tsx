import { useEffect, useState, type ReactNode } from 'react';
import AlertsIcon from '@assets/icons/alerts.svg?react';
import FinancialAndLaborIcon from '@assets/icons/financial_and_labor.svg?react';
import InventoryAndSupplyChainIcon from '@assets/icons/inventory_and_supply_chain.svg?react';
import ReputationAndHrIcon from '@assets/icons/reputation_and_hr.svg?react';
import { Spinner } from '../common/Spinner';
import { COMMAND_CENTER_ALERT_NEW_BADGE_CLASSNAME } from '../../utils/commandCenterAlertNewBadge.util';

export type AlertSeverity = 'critical' | 'warning';

const NEW_BADGE_MS = 15 * 60 * 1000;

function isAlertNew(createdAt: string | undefined, now: number): boolean {
  if (createdAt == null || createdAt === '') return false;
  return now - new Date(createdAt).getTime() < NEW_BADGE_MS;
}

export interface AlertItem {
  id: string;
  /** Short alert kind (e.g. "Sales goal") */
  titleLine: string;
  /** Detail text; omitted when empty */
  bodyLine?: string;
  /** e.g. formatted time */
  subtitle?: string;
  severity: AlertSeverity;
  dismissable?: boolean;
  /** ISO time — used for the time-limited "New" label */
  createdAt?: string;
}

export interface AlertCategory {
  id: string;
  title: string;
  icon: ReactNode;
  alerts: AlertItem[];
}

export interface AlertsCardProps {
  categories: AlertCategory[];
  loading?: boolean;
  error?: string | null;
  onDismiss?: (notificationId: string) => void;
  onViewAll?: (categoryId: string) => void;
}

function CategoryAlertCountBadge({
  loading,
  categoryTitle,
  count,
}: Readonly<{ loading: boolean; categoryTitle: string; count: number }>) {
  if (loading) {
    return (
      <span
        className="inline-flex items-center justify-center min-h-[1.25rem] min-w-[1.75rem]"
        aria-label={`Loading ${categoryTitle} alert count`}
        aria-busy="true"
      >
        <Spinner size="sm" className="text-button-primary" />
      </span>
    );
  }
  if (count > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] md:text-xs font-semibold text-secondary tabular-nums">
        {count}
      </span>
    );
  }
  return null;
}

function AlertSubtitleDisplay({
  subtitle,
  createdAt,
}: Readonly<{ subtitle: string; createdAt?: string }>) {
  if (createdAt != null && createdAt !== '') {
    return (
      <time className="text-[10px] text-secondary opacity-90 md:text-xs" dateTime={createdAt}>
        {subtitle}
      </time>
    );
  }
  return <span className="text-[10px] text-secondary opacity-90 md:text-xs">{subtitle}</span>;
}

function CategoryAlertsContent({
  loading,
  categoryTitle,
  alerts,
  now,
  onDismiss,
}: Readonly<{
  loading: boolean;
  categoryTitle: string;
  alerts: AlertItem[];
  now: number;
  onDismiss?: (notificationId: string) => void;
}>) {
  if (loading) {
    return (
      <section
        aria-label={`Loading ${categoryTitle} alerts`}
        aria-busy="true"
        className="flex min-h-[min(12rem,32vh)] w-full items-center justify-center py-6"
      >
        <Spinner size="md" className="text-button-primary" />
      </section>
    );
  }
  if (alerts.length === 0) {
    return <p className="text-[10px] md:text-xs 2xl:text-sm text-secondary pl-7">No active alerts.</p>;
  }
  return (
    <section
      aria-label={`${categoryTitle} alerts`}
      className="max-h-[min(15rem,40vh)] overflow-y-auto overscroll-y-contain pr-1 dropdown-list-scrollbar"
    >
      <div className="flex flex-col">
        {alerts.map((alert, index) => {
          const showNew = isAlertNew(alert.createdAt, now);
          const hasMetaBelow = showNew || (alert.subtitle != null && alert.subtitle !== '');
          return (
            <div
              key={alert.id}
              className={`flex flex-wrap items-start gap-x-3 gap-y-1 py-2 pl-7 pr-3 text-[10px] md:text-xs 2xl:text-sm text-primary ${index % 2 === 1 ? 'bg-[#F3F5F7]' : ''
                }`}
            >
              <span className="flex min-w-0 flex-1 items-start gap-1.5">
                <span
                  className={`mt-1.5 h-1 w-1 flex-shrink-0 rounded-full md:h-1.5 md:w-1.5 2xl:h-2 2xl:w-2 ${alert.severity === 'critical' ? 'bg-[#F04B5B]' : 'bg-[#FBC52A]'
                    }`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                    <span className="font-semibold text-primary">{alert.titleLine}</span>
                    {alert.bodyLine != null && alert.bodyLine !== '' ? (
                      <>
                        <span className="shrink-0 select-none text-secondary" aria-hidden>
                          ·
                        </span>
                        <span className="min-w-0 font-normal text-secondary">{alert.bodyLine}</span>
                      </>
                    ) : null}
                  </span>
                  {hasMetaBelow ? (
                    <span className="mt-0.5 flex flex-row flex-wrap items-center gap-1.5">
                      {alert.subtitle != null && alert.subtitle !== '' ? (
                        <AlertSubtitleDisplay subtitle={alert.subtitle} createdAt={alert.createdAt} />
                      ) : null}
                      {showNew ? (
                        <span className={COMMAND_CENTER_ALERT_NEW_BADGE_CLASSNAME} aria-label="New alert">
                          New
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </span>
              {alert.dismissable && onDismiss != null && (
                <button
                  type="button"
                  onClick={() => onDismiss(alert.id)}
                  className="shrink-0 self-start text-[10px] text-button-primary hover:underline md:text-xs"
                >
                  Dismiss
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export const AlertsCard = ({
  categories,
  loading = false,
  error = null,
  onDismiss,
  onViewAll,
}: AlertsCardProps) => {
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const totalAlerts = categories.reduce((n, c) => n + c.alerts.length, 0);
  const now = Date.now();

  return (
    <div
      className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden"
      data-minute-tick={minuteTick}
    >
      <div className="p-5 pb-4 flex items-center justify-between gap-3 flex-wrap border-b border-gray-200">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-secondary flex items-center gap-2">
          <AlertsIcon className="w-5 h-5 md:w-6 md:h-6 2xl:w-7 2xl:h-7 flex-shrink-0" aria-hidden />
          Alerts
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          {loading ? (
            <Spinner size="sm" className="text-button-primary" />
          ) : (
            <span
              className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs md:text-sm font-semibold text-secondary tabular-nums"
              aria-label={`${totalAlerts} total ${totalAlerts === 1 ? "alert" : "alerts"}`}
            >
              {totalAlerts} {totalAlerts === 1 ? "alert" : "alerts"}
            </span>
          )}
        </div>
      </div>

      {error != null && error !== '' && (
        <p className="px-5 py-2 text-xs text-negative" role="alert">
          {error}
        </p>
      )}

      <div className="divide-y divide-gray-200">
        {categories.map((category) => (
          <div key={category.id} className="px-5 py-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="flex flex-wrap items-center gap-2 text-xs md:text-sm 2xl:text-base font-medium text-secondary">
                {category.icon}
                <span>{category.title}</span>
                <CategoryAlertCountBadge
                  loading={loading}
                  categoryTitle={category.title}
                  count={category.alerts.length}
                />
              </h4>
              {onViewAll != null && (
                <button
                  type="button"
                  onClick={() => onViewAll(category.id)}
                  disabled={loading}
                  className="shrink-0 text-[10px] md:text-xs font-medium text-[#FBC52A] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Past alerts
                </button>
              )}
            </div>
            <CategoryAlertsContent
              loading={loading}
              categoryTitle={category.title}
              alerts={category.alerts}
              now={now}
              onDismiss={onDismiss}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export const financialAlertsIcon = (
  <FinancialAndLaborIcon
    className="w-4 h-4 md:w-4.5 md:h-4.5 2xl:w-5 2xl:h-5 text-primary flex-shrink-0"
    aria-hidden
  />
);

export const inventoryAlertsIcon = (
  <InventoryAndSupplyChainIcon
    className="w-4 h-4 md:w-4.5 md:h-4.5 2xl:w-5 2xl:h-5 text-primary flex-shrink-0"
    aria-hidden
  />
);

export const reputationAlertsIcon = (
  <ReputationAndHrIcon
    className="w-4 h-4 md:w-4.5 md:h-4.5 2xl:w-5 2xl:h-5 text-primary flex-shrink-0"
    aria-hidden
  />
);
