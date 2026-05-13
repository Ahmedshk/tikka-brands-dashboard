import { getStatusColor, getStatusLabel } from "../../types/review.types";
import type { ReviewCycleStatus } from "../../types/review.types";

export const StatusBadge = ({ status }: { status: ReviewCycleStatus }) => {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${getStatusColor(status)}`}
    >
      {getStatusLabel(status)}
    </span>
  );
};

