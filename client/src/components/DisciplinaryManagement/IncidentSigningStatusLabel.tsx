import type { IncidentHistorySigningStatus } from '../../types/disciplinaryManagement.types';
import PendingIcon from '@assets/icons/pending.svg?react';
import CompliantIcon from '@assets/icons/compliant.svg?react';

export interface IncidentSigningStatusLabelProps {
  readonly status: IncidentHistorySigningStatus;
  /** Smaller icon/text for dense tables (card) */
  readonly dense?: boolean;
}

const TERMINAL_LABELS: Record<
  Exclude<IncidentHistorySigningStatus, 'pending' | 'signed'>,
  string
> = {
  declined: 'Rejected',
  cancelled: 'Canceled',
  expired: 'Expired',
};

export function IncidentSigningStatusLabel({
  status,
  dense = false,
}: IncidentSigningStatusLabelProps) {
  const iconClass = dense
    ? 'w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 shrink-0'
    : 'w-4 h-4 shrink-0';

  if (status === 'pending') {
    return (
      <>
        <PendingIcon
          className={`${iconClass} text-pending font-semibold`}
          aria-hidden
        />
        <span className="text-pending font-semibold">Pending Signature</span>
      </>
    );
  }

  if (status === 'signed') {
    return (
      <>
        <CompliantIcon className={`${iconClass} text-positive`} aria-hidden />
        <span className="text-positive font-semibold">Signed</span>
      </>
    );
  }

  return (
    <span className="text-secondary font-semibold">
      {TERMINAL_LABELS[status]}
    </span>
  );
}
