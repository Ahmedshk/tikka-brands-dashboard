export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const MAX_VISIBLE_PAGES = 5;

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= MAX_VISIBLE_PAGES) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(MAX_VISIBLE_PAGES / 2);
  let start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + MAX_VISIBLE_PAGES - 1);
  if (end - start + 1 < MAX_VISIBLE_PAGES) {
    start = Math.max(1, end - MAX_VISIBLE_PAGES + 1);
  }
  const pages: (number | 'ellipsis')[] = [];
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push('ellipsis');
  }
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (end < totalPages) {
    if (end < totalPages - 1) pages.push('ellipsis');
    pages.push(totalPages);
  }
  return pages;
}

export const Pagination = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: PaginationProps) => {
  const pageNumbers = getPageNumbers(currentPage, totalPages);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  if (totalPages <= 1 && totalItems <= pageSize) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 px-3 py-2 sm:px-6 sm:py-3 border-t border-gray-200 bg-card-background">
      <p className="text-[10px] sm:text-sm text-primary order-2 sm:order-1">
        Showing <span className="font-medium">{startItem}</span>–<span className="font-medium">{endItem}</span> of{' '}
        <span className="font-medium">{totalItems}</span>
      </p>
      <nav className="flex items-center gap-0.5 sm:gap-2 order-1 sm:order-2" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="min-w-[1.75rem] sm:min-w-[2.25rem] h-7 sm:h-9 px-1.5 sm:px-3 rounded-lg sm:rounded-xl border border-gray-200 bg-white text-xs sm:text-sm font-medium text-primary hover:bg-button-secondary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
          aria-label="Previous page"
          title="Previous page"
        >
          Previous
        </button>
        <div className="flex items-center gap-0.5">
          {pageNumbers.map((page, i) =>
            page === 'ellipsis' ? (
              <span key={i < pageNumbers.length / 2 ? 'ellipsis-start' : 'ellipsis-end'} className="px-1 sm:px-2 text-primary text-xs sm:text-sm" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                disabled={page === currentPage}
                className={`min-w-[1.75rem] sm:min-w-[2.25rem] h-7 sm:h-9 px-1.5 sm:px-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer ${page === currentPage
                    ? 'bg-button-primary text-white cursor-default'
                    : 'border border-gray-200 bg-white text-primary hover:bg-button-secondary'
                  }`}
                aria-label={page === currentPage ? `Page ${page} (current)` : `Page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
                title={page === currentPage ? `Page ${page} (current)` : `Go to page ${page}`}
              >
                {page}
              </button>
            )
          )}
        </div>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="min-w-[1.75rem] sm:min-w-[2.25rem] h-7 sm:h-9 px-1.5 sm:px-3 rounded-lg sm:rounded-xl border border-gray-200 bg-white text-xs sm:text-sm font-medium text-primary hover:bg-button-secondary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
          aria-label="Next page"
          title="Next page"
        >
          Next
        </button>
      </nav>
    </div>
  );
};
