import type { IncidentHistoryItem } from '../../types/disciplinaryManagement.types';
import { IncidentSigningStatusLabel } from './IncidentSigningStatusLabel';
import ViewIcon from '@assets/icons/view.svg?react';
import SignatureIcon from '@assets/icons/signature.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export interface IncidentHistoryCardProps {
  items: IncidentHistoryItem[];
  title?: string;
  emptyMessage?: string;
  onView?: (item: IncidentHistoryItem, index: number) => void;
  onSign?: (item: IncidentHistoryItem, index: number) => void;
  canSign?: (item: IncidentHistoryItem, index: number) => boolean;
  signLoadingIncidentId?: string | null;
  onViewAll?: () => void;
}

export const IncidentHistoryCard = ({
  items,
  title = 'Incident History (90 Days)',
  emptyMessage = 'No incidents available.',
  onView,
  onSign,
  canSign,
  signLoadingIncidentId,
  onViewAll,
}: IncidentHistoryCardProps) => {
  const getAssignerStatus = (item: IncidentHistoryItem): IncidentHistoryItem['status'] => {
    if (item.managerSignedAt) return 'signed';
    if (item.signingPhase === 'pending_manager') return 'pending';
    if (item.signingPhase === 'declined') return 'declined';
    if (item.signingPhase === 'cancelled') return 'cancelled';
    if (item.signingPhase === 'expired') return 'expired';
    return 'signed';
  };

  const getAssigneeStatus = (item: IncidentHistoryItem): IncidentHistoryItem['status'] => {
    if (item.employeeSignedAt) return 'signed';
    if (item.signingPhase === 'declined') return 'declined';
    if (item.signingPhase === 'cancelled') return 'cancelled';
    if (item.signingPhase === 'expired') return 'expired';
    return 'pending';
  };

  return (
    <div className={`${cardClass} flex flex-col min-h-0 overflow-hidden h-full`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center flex-shrink-0">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
          {title}
        </h3>
      </div>
      <div className="p-5 flex-1 min-h-0 overflow-hidden flex flex-col">
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-4 py-10 text-center text-sm text-secondary">
            {emptyMessage}
          </div>
        ) : (
          <>
            <div className="md:hidden flex-1 min-h-0 overflow-y-auto divide-y divide-gray-200">
              {items.map((item, index) => {
            const isPendingManager = item.signingPhase === 'pending_manager';
            const isAuthorizedSigner = canSign?.(item, index) ?? isPendingManager;
            const showSignAction = isPendingManager && isAuthorizedSigner;
            const isSignLoading = showSignAction && signLoadingIncidentId === item.id;

            return (
              <div
                key={`${item.id}-mobile-${index}`}
                className={`px-3 py-3 ${index % 2 === 1 ? 'bg-[#F3F5F7]' : 'bg-white'}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary whitespace-normal break-words">{item.incidentType}</p>
                  <p className="text-xs text-secondary mt-0.5">{item.date}</p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-secondary">Total Points:</span>
                    <span className="font-medium text-primary">{item.totalPoints}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-secondary">Assigner Signature:</span>
                    <IncidentSigningStatusLabel status={getAssignerStatus(item)} dense />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-secondary">Assignee Signature:</span>
                    <IncidentSigningStatusLabel status={getAssigneeStatus(item)} dense />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end gap-1">
                  {showSignAction && (
                    <button
                      type="button"
                      onClick={() => onSign?.(item, index)}
                      disabled={isSignLoading}
                      className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors disabled:opacity-60"
                      aria-label="Sign"
                      title="Sign"
                    >
                      {isSignLoading ? (
                        <span className="inline-block w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                      ) : (
                        <SignatureIcon className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onView?.(item, index)}
                    className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                    aria-label="View"
                    title="View"
                  >
                    <ViewIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto overflow-y-auto min-h-0 flex-1">
              <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
                <thead>
                  <tr className="text-left text-secondary border-b border-gray-200">
                    <th className="pb-3 pr-4 pl-2 font-semibold">Incident Type</th>
                    <th className="pb-3 pr-4 font-semibold text-center">Date</th>
                    <th className="pb-3 pr-4 font-semibold text-center">Total Points</th>
                    <th className="pb-3 pr-4 font-semibold text-center">Assigner Signature</th>
                    <th className="pb-3 pr-4 font-semibold text-center">Assignee Signature</th>
                    <th className="pb-3 pr-2 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-primary">
                  {items.map((item, index) => {
                const isPendingManager = item.signingPhase === 'pending_manager';
                const isAuthorizedSigner = canSign?.(item, index) ?? isPendingManager;
                const showSignAction = isPendingManager && isAuthorizedSigner;
                const isSignLoading = showSignAction && signLoadingIncidentId === item.id;
                let actionIcon = null;
                if (showSignAction) {
                  actionIcon = (
                    <SignatureIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                  );
                }
                if (isSignLoading) {
                  actionIcon = (
                    <span className="inline-block w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                  );
                }
                return (
                  <tr
                    key={`${item.incidentType}-${item.date}-${index}`}
                    className={index % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                  >
                    <td className="py-3 pr-4 pl-2">{item.incidentType}</td>
                    <td className="py-3 pr-4 text-center">{item.date}</td>
                    <td className="py-3 pr-4 text-center">{item.totalPoints}</td>
                    <td className="py-3 pr-4 text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <IncidentSigningStatusLabel status={getAssignerStatus(item)} dense />
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <IncidentSigningStatusLabel status={getAssigneeStatus(item)} dense />
                      </div>
                    </td>
                    <td className="py-3 pr-2">
                      <div className="flex items-center justify-center gap-1">
                        {showSignAction && (
                          <button
                            type="button"
                            onClick={() => onSign?.(item, index)}
                            disabled={isSignLoading}
                            className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors disabled:opacity-60"
                            aria-label="Sign"
                            title="Sign"
                          >
                            {actionIcon}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onView?.(item, index)}
                          className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                          aria-label="View"
                          title="View"
                        >
                          <ViewIcon className="w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {onViewAll != null && (
          <div className="flex justify-end pt-3 flex-shrink-0">
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-medium text-quaternary hover:underline bg-transparent border-0 cursor-pointer p-0"
              title="View all"
            >
              View All
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
