import type { ReactNode } from 'react';
import SearchIcon from '@assets/icons/search.svg?react';

export interface DisciplinaryToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** Override placeholder (default: disciplinary copy). */
  placeholder?: string;
  /** Override input aria-label (default: matches disciplinary placeholder). */
  searchAriaLabel?: string;
  /** Renders on the right (e.g. primary action); row uses space-between when set. */
  trailing?: ReactNode;
}

export const DisciplinaryToolbar = ({
  searchValue,
  onSearchChange,
  placeholder = 'Search by name or role...',
  searchAriaLabel = 'Search by name or role',
  trailing,
}: DisciplinaryToolbarProps) => {
  return (
    <div
      className={`flex flex-wrap items-center gap-4 mb-6 ${trailing === undefined ? 'justify-end' : 'justify-between'}`}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <div className="relative order-2 md:order-1">
          <SearchIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 text-secondary shrink-0 pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className="search-input-gray-clear w-full min-w-[200px] md:min-w-[260px] rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-xs md:text-sm 2xl:text-base text-primary placeholder:text-xs placeholder:md:text-sm placeholder:2xl:text-base placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-gray-300/50"
            aria-label={searchAriaLabel}
          />
        </div>
      </div>
      {trailing}
    </div>
  );
};
