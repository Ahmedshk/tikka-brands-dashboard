import { getStageStatusColor } from "../../types/review.types";

export const StageBadge = ({ label }: { label: string }) => {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${getStageStatusColor(label)}`}
    >
      {label}
    </span>
  );
};

