import { ClockedInStaffTable } from './ClockedInStaffTable';
import type { TimesheetRow } from './ClockedInStaffTable';
import { Spinner } from '../common/Spinner';

export interface ClockedInStaffCardProps {
  rows: TimesheetRow[];
  loading?: boolean;
  /** Optional className for the card wrapper (e.g. for grid sizing) */
  className?: string;
}

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export const ClockedInStaffCard = ({ rows, loading, className = '' }: ClockedInStaffCardProps) => {
  let content: React.ReactNode;
  if (loading) {
    content = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" className="text-button-primary" />
      </div>
    );
  } else if (rows.length === 0) {
    content = (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-secondary text-center">No timesheet data for today.</p>
      </div>
    );
  } else {
    content = <ClockedInStaffTable rows={rows} />;
  }

  return (
    <div className={`${cardClass} ${className}`}>
      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center justify-center md:justify-start flex-wrap gap-2">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">Today&apos;s Timesheet</h3>
      </div>
      <div className="p-5 min-h-[280px] flex flex-col">
        {content}
      </div>
    </div>
  );
};
