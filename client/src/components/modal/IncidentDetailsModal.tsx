import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { IncidentHistoryItem } from '../../types/disciplinaryManagement.types';
import DownloadIcon from '@assets/icons/download.svg?react';

interface IncidentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  incident: IncidentHistoryItem | null;
  onDownload?: (incident: IncidentHistoryItem) => void;
  onDownloadAuditTrail?: (incident: IncidentHistoryItem) => void;
}

function formatSignedAt(value?: string): string {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleString('en-US');
}

function signatureStateLabel(phase: IncidentHistoryItem['signingPhase']): string {
  if (phase === 'completed') return 'Signed';
  if (phase === 'declined') return 'Declined';
  if (phase === 'expired') return 'Expired';
  if (phase === 'cancelled') return 'Cancelled';
  return 'Pending';
}

export function IncidentDetailsModal({
  isOpen,
  onClose,
  incident,
  onDownload,
  onDownloadAuditTrail,
}: IncidentDetailsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  if (isOpen === false || incident == null) return null;

  const managerState = incident.managerSignedAt
    ? 'Signed'
    : signatureStateLabel(incident.signingPhase);
  let employeeState = signatureStateLabel(incident.signingPhase);
  if (incident.signingPhase === 'pending_employee') {
    employeeState = 'Pending';
  }
  if (incident.employeeSignedAt) {
    employeeState = 'Signed';
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="incident-details-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-3xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="bg-card-background rounded-xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex flex-col items-center gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
            <h2 id="incident-details-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Incident Details
            </h2>
            <div className="flex w-full items-center justify-center gap-2 md:w-auto md:justify-end">
              <button
                type="button"
                onClick={() => onDownloadAuditTrail?.(incident)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs md:text-sm font-medium text-primary hover:bg-gray-50"
              >
                <DownloadIcon className="w-4 h-4" />
                Audit Trail
              </button>
              <button
                type="button"
                onClick={() => onDownload?.(incident)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs md:text-sm font-medium text-primary hover:bg-gray-50"
              >
                <DownloadIcon className="w-4 h-4" />
                Document
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-6 space-y-5 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-tertiary text-xs uppercase tracking-wide">Incident Type</p>
                <p className="text-primary font-medium">{incident.incidentType}</p>
              </div>
              <div>
                <p className="text-tertiary text-xs uppercase tracking-wide">Date</p>
                <p className="text-primary font-medium">{incident.date}</p>
              </div>
              <div>
                <p className="text-tertiary text-xs uppercase tracking-wide">Assigned By</p>
                <p className="text-primary font-medium">{incident.assignerName}</p>
              </div>
              <div>
                <p className="text-tertiary text-xs uppercase tracking-wide">Total Points</p>
                <p className="text-primary font-medium">{incident.totalPoints}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-tertiary text-xs uppercase tracking-wide">Assigner Signature</p>
                <p className="text-primary font-medium mt-1">{managerState}</p>
                <p className="text-secondary text-xs mt-1">{formatSignedAt(incident.managerSignedAt)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-tertiary text-xs uppercase tracking-wide">Assignee Signature</p>
                <p className="text-primary font-medium mt-1">{employeeState}</p>
                <p className="text-secondary text-xs mt-1">{formatSignedAt(incident.employeeSignedAt)}</p>
              </div>
            </div>

            <div>
              <p className="text-tertiary text-xs uppercase tracking-wide">Details Of Incident</p>
              <p className="text-primary whitespace-pre-wrap">{incident.detailsOfIncident}</p>
            </div>
            <div>
              <p className="text-tertiary text-xs uppercase tracking-wide">Supervisor Commitment</p>
              <p className="text-primary whitespace-pre-wrap">{incident.supervisorCommitment}</p>
            </div>
            <div>
              <p className="text-tertiary text-xs uppercase tracking-wide">Supervisor Comments</p>
              <p className="text-primary whitespace-pre-wrap">{incident.supervisorComments}</p>
            </div>
            {incident.positiveResults && (
              <div>
                <p className="text-tertiary text-xs uppercase tracking-wide">Positive Results</p>
                <p className="text-primary whitespace-pre-wrap">{incident.positiveResults}</p>
              </div>
            )}
            {incident.negativeConsequences && (
              <div>
                <p className="text-tertiary text-xs uppercase tracking-wide">Negative Consequences</p>
                <p className="text-primary whitespace-pre-wrap">{incident.negativeConsequences}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
