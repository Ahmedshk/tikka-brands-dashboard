import { LinearProgress } from '@mui/material';
import type { DisciplinaryStatus } from '../../types/disciplinaryManagement.types';
import { TREND_POSITIVE, TREND_NEGATIVE } from '../../constants/trendColors';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

function getProgressBarColor(status: DisciplinaryStatus): string {
  if (status === 'Critical') return TREND_NEGATIVE;
  if (status === 'At Risk') return '#D97706';
  if (status === 'Caution') return '#FACC15';
  return TREND_POSITIVE;
}

const statusPillClass: Record<DisciplinaryStatus, string> = {
  Caution: 'rounded-full px-2 py-0.5 text-[8px] md:text-[10px] 2xl:text-xs font-medium bg-[#FEF08A] text-[#854D0E]',
  'At Risk': 'rounded-full px-2 py-0.5 text-[8px] md:text-[10px] 2xl:text-xs font-medium bg-[#D97706] text-white',
  'Good Standing': 'rounded-full px-2 py-0.5 text-[8px] md:text-[10px] 2xl:text-xs font-medium bg-[rgba(93,197,79,0.2)] text-primary',
  Critical: 'rounded-full px-2 py-0.5 text-[8px] md:text-[10px] 2xl:text-xs font-medium bg-[#FF1C28] text-white',
};

function getInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed[0]?.toUpperCase() ?? '?';
}

export interface EmployeeWithRollingTotalCardProps {
  name: string;
  role: string;
  status: DisciplinaryStatus;
  avatarUrl?: string;
  currentPoints: number;
  maxPoints: number;
  noteText?: string;
}

export const EmployeeWithRollingTotalCard = ({
  name,
  role,
  status,
  avatarUrl,
  currentPoints,
  maxPoints,
  noteText = 'Points older than 90-days are automatically removed from calculation.',
}: EmployeeWithRollingTotalCardProps) => {
  const displayPercent = maxPoints === 0 ? 0 : Math.min(100, Math.round((currentPoints / maxPoints) * 100));
  const barColor = getProgressBarColor(status);

  return (
    <div className={`${cardClass} h-full flex flex-col min-h-0`}>
      <div className="p-5 flex-1 min-h-0 flex flex-col items-center text-center justify-center">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-20 h-20 rounded-full object-cover mb-3"
            aria-hidden
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full bg-button-primary text-white flex items-center justify-center text-2xl font-semibold mb-3"
            aria-hidden
          >
            {getInitial(name)}
          </div>
        )}
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">{name}</h3>
        <p className="text-xs md:text-sm 2xl:text-base text-secondary mb-2">{role}</p>
        <span className={statusPillClass[status]}>{status}</span>
      </div>
      <div className="border-t border-gray-200 py-5 mx-10 flex-shrink-0">
        <div className="flex items-center justify-between text-[10px] md:text-xs 2xl:text-sm mb-1">
          <span className="font-medium text-secondary">90-day Rolling Total</span>
          <span className="font-medium text-secondary">
            {currentPoints}/{maxPoints}
          </span>
        </div>
        <LinearProgress
          variant="determinate"
          value={displayPercent}
          sx={{
            height: 8,
            borderRadius: 4,
            backgroundColor: 'rgba(229, 231, 235, 0.8)',
            '& .MuiLinearProgress-bar': { backgroundColor: barColor },
          }}
        />
        <p className="mt-3 text-[10px] md:text-xs 2xl:text-sm text-secondary">{noteText}</p>
      </div>
    </div>
  );
};
