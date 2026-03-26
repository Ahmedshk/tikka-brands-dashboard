import type { DisciplinaryStatus } from '../../types/disciplinaryManagement.types';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

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

export interface EmployeeDetailsCardProps {
  name: string;
  role: string;
  status: DisciplinaryStatus;
  avatarUrl?: string;
}

export const EmployeeDetailsCard = ({
  name,
  role,
  status,
  avatarUrl,
}: EmployeeDetailsCardProps) => {
  return (
    <div className={`${cardClass} p-5 flex flex-col items-center text-center`}>
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
  );
};
