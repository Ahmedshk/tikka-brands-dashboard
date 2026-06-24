import { Link } from 'react-router-dom';
import AddIcon from '@assets/icons/add.svg?react';

export interface DetailsPageHeaderProps {
  dateWindowStart: string;
  dateWindowEnd: string;
  backTo: string;
  onAssignPoints: () => void;
  /** When false, the Assign Points button is hidden (RBAC). */
  showAssignPoints?: boolean;
}

export const DetailsPageHeader = (props: DetailsPageHeaderProps) => {
  const {
    dateWindowStart,
    dateWindowEnd,
    backTo,
    onAssignPoints,
    showAssignPoints = true,
  } = props;
  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base md:text-lg 2xl:text-xl font-semibold text-primary">
          Disciplinary Management
        </h2>
        <div className="flex items-center gap-2 text-xs md:text-sm 2xl:text-base">
          <span className="font-semibold text-secondary">90-DAY WINDOW</span>
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-primary">
            {dateWindowStart} - {dateWindowEnd}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={backTo}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-primary text-sm font-medium hover:bg-gray-50 transition-colors no-underline"
        >
          ← Back
        </Link>
        {showAssignPoints ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAssignPoints}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <AddIcon className="w-4 h-4 shrink-0" aria-hidden />
              Assign Points
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
