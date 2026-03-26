import CriticalIcon from '@assets/icons/critical.svg?react';

const cardClass = 'bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden';

export interface RequiredProtocolCardProps {
  message: string;
  currentAction: string;
}

export const RequiredProtocolCard = (props: RequiredProtocolCardProps) => {
  const { message, currentAction } = props;
  return (
    <div className={`${cardClass} h-full flex flex-col min-h-0 p-5 items-center text-center justify-center`}>
      <CriticalIcon className="w-8 h-8 shrink-0 text-[#FF1C28] mb-2" aria-hidden />
      <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-[#FF1C28] mb-2">
        Required Protocol
      </h3>
      <div className="w-full border-t border-gray-200 mb-3" aria-hidden />
      <p className="text-[10px] md:text-xs 2xl:text-sm text-primary mb-2">{message}</p>
      <p className="text-xs md:text-sm 2xl:text-base font-bold text-primary">{currentAction}</p>
    </div>
  );
};
