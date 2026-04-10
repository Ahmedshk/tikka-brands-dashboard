import type { ReactNode } from 'react';
import AlertsIcon from '@assets/icons/alerts.svg?react';
import FinancialAndLaborIcon from '@assets/icons/financial_and_labor.svg?react';
import InventoryAndSupplyChainIcon from '@assets/icons/inventory_and_supply_chain.svg?react';
import ReputationAndHrIcon from '@assets/icons/reputation_and_hr.svg?react';
import { Spinner } from '../common/Spinner';

export type AlertSeverity = 'critical' | 'warning';

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
}

export const AlertsCard = ({
  categories,
  loading = false,
  error = null,
  onDismiss,
}: AlertsCardProps) => {
  const totalAlerts = categories.reduce((n, c) => n + c.alerts.length, 0);

  return (
    <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden">
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
                {category.alerts.length > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] md:text-xs font-semibold text-secondary tabular-nums">
                    {category.alerts.length}
                  </span>
                ) : null}
              </h4>
            </div>
            {category.alerts.length === 0 ? (
              <p className="text-[10px] md:text-xs 2xl:text-sm text-secondary pl-7">No active alerts.</p>
            ) : (
              <section
                aria-label={`${category.title} alerts`}
                className="max-h-[min(15rem,40vh)] overflow-y-auto overscroll-y-contain pl-7 pr-1 dropdown-list-scrollbar"
              >
                <div className="flex flex-col gap-2">
                  {category.alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex flex-wrap items-start gap-x-3 gap-y-1 text-[10px] md:text-xs 2xl:text-sm text-primary"
                    >
                      <span className="flex items-start gap-1.5 min-w-0 flex-1">
                        <span
                          className={`mt-1.5 w-1 h-1 md:w-1.5 md:h-1.5 2xl:w-2 2xl:h-2 rounded-full flex-shrink-0 ${
                            alert.severity === 'critical' ? 'bg-[#F04B5B]' : 'bg-[#FBC52A]'
                          }`}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold text-primary">{alert.titleLine}</span>
                          {alert.bodyLine != null && alert.bodyLine !== '' && (
                            <span className="block text-secondary mt-0.5 font-normal">{alert.bodyLine}</span>
                          )}
                          {alert.subtitle != null && alert.subtitle !== '' && (
                            <span className="block text-secondary mt-0.5 text-[10px] md:text-xs opacity-90">
                              {alert.subtitle}
                            </span>
                          )}
                        </span>
                      </span>
                      {alert.dismissable && onDismiss != null && (
                        <button
                          type="button"
                          onClick={() => onDismiss(alert.id)}
                          className="shrink-0 text-[10px] md:text-xs text-button-primary hover:underline"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
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
