import SearchIcon from '@assets/icons/search.svg?react';

export interface DisciplinaryToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
}

export const DisciplinaryToolbar = ({
  searchValue,
  onSearchChange,
}: DisciplinaryToolbarProps) => {
  return (
    <div className="flex flex-wrap items-center justify-end gap-4 mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative order-2 md:order-1">
          <SearchIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 text-secondary shrink-0 pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name or role..."
            className="search-input-gray-clear w-full min-w-[200px] md:min-w-[260px] rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-xs md:text-sm 2xl:text-base text-primary placeholder:text-xs placeholder:md:text-sm placeholder:2xl:text-base placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-gray-300/50"
            aria-label="Search by name or role"
          />
        </div>
      </div>
    </div>
  );
};
