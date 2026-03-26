import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pagination } from '../common/Pagination';
import type { IncidentHistoryItem } from '../../types/disciplinaryManagement.types';
import { IncidentSigningStatusLabel } from '../DisciplinaryManagement/IncidentSigningStatusLabel';
import ViewIcon from '@assets/icons/view.svg?react';
import SignatureIcon from '@assets/icons/signature.svg?react';

const PAGE_SIZE = 10;

export interface IncidentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: IncidentHistoryItem[];
  title?: string;
  onView?: (item: IncidentHistoryItem, index: number) => void;
  onSign?: (item: IncidentHistoryItem, index: number) => void;
  canSign?: (item: IncidentHistoryItem, index: number) => boolean;
  signLoadingIncidentId?: string | null;
}

export const IncidentHistoryModal = ({
  isOpen,
  onClose,
  items,
  title = 'Incident History (90 Days)',
  onView,
  onSign,
  canSign,
  signLoadingIncidentId,
}: IncidentHistoryModalProps) => {
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

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
      setPage(1);
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = items.slice(start, start + PAGE_SIZE);

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="incident-history-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-5xl">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-gray-700 px-5 py-3 flex-shrink-0">
            <h2 id="incident-history-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              {title}
            </h2>
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col px-5 pt-4 overflow-hidden border-x border-gray-200">
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-auto md:[scrollbar-gutter:stable]">
              <table className="w-full min-w-[700px] border-collapse text-[10px] md:text-xs 2xl:text-sm">
                <thead>
                  <tr className="text-left text-secondary border-b border-gray-200">
                    <th className="pb-3 pr-4 pl-2 font-semibold">Incident Type</th>
                    <th className="pb-3 pr-4 font-semibold">Date</th>
                    <th className="pb-3 pr-4 font-semibold text-center">Total Points</th>
                    <th className="pb-3 pr-4 font-semibold text-center">Assigner Signature</th>
                    <th className="pb-3 pr-4 font-semibold text-center">Assignee Signature</th>
                    <th className="pb-3 pr-2 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-primary">
                  {pageItems.map((item, index) => {
                    const globalIndex = start + index;
                    const isPendingManager = item.signingPhase === 'pending_manager';
                    const isAuthorizedSigner = canSign?.(item, globalIndex) ?? isPendingManager;
                    const showSignAction = isPendingManager && isAuthorizedSigner;
                    const isSignLoading = showSignAction && signLoadingIncidentId === item.id;
                    let actionIcon = null;
                    if (showSignAction) {
                      actionIcon = <SignatureIcon className="w-4 h-4" />;
                    }
                    if (isSignLoading) {
                      actionIcon = (
                        <span className="inline-block w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                      );
                    }
                    return (
                      <tr
                        key={`${item.incidentType}-${item.date}-${globalIndex}`}
                        className={globalIndex % 2 === 1 ? 'bg-[#F3F5F7]' : ''}
                      >
                        <td className="py-3 pr-4 pl-2">{item.incidentType}</td>
                        <td className="py-3 pr-4">{item.date}</td>
                        <td className="py-3 pr-4 text-center">{item.totalPoints}</td>
                        <td className="py-3 pr-4 text-center">
                          <div className="flex items-center gap-1.5 justify-center">
                            <IncidentSigningStatusLabel status={getAssignerStatus(item)} />
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <div className="flex items-center gap-1.5">
                            <IncidentSigningStatusLabel status={getAssigneeStatus(item)} />
                          </div>
                        </td>
                        <td className="py-3 pr-2">
                          <div className="flex items-center justify-center gap-1">
                            {showSignAction && (
                              <button
                                type="button"
                                onClick={() => onSign?.(item, globalIndex)}
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
                              onClick={() => onView?.(item, globalIndex)}
                              className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors"
                              aria-label="View"
                              title="View"
                            >
                              <ViewIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={items.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>
    </dialog>,
    document.body
  );
};
