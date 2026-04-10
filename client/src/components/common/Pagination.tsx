import { useSyncExternalStore } from "react";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/** Align with Tailwind `sm` (640px). */
const SM_BREAKPOINT_PX = 640;
const MAX_VISIBLE_PAGES_DESKTOP = 5;
const MAX_VISIBLE_PAGES_MOBILE = 3;

function useIsSmUp(): boolean {
  const query = `(min-width: ${SM_BREAKPOINT_PX}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const mq = globalThis.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => globalThis.matchMedia(query).matches,
    () => false,
  );
}

function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisiblePages: number,
): (number | "ellipsis")[] {
  if (totalPages <= maxVisiblePages) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(maxVisiblePages / 2);
  let start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + maxVisiblePages - 1);
  if (end - start + 1 < maxVisiblePages) {
    start = Math.max(1, end - maxVisiblePages + 1);
  }
  const pages: (number | "ellipsis")[] = [];
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("ellipsis");
  }
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (end < totalPages) {
    if (end < totalPages - 1) pages.push("ellipsis");
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
  const isSmUp = useIsSmUp();
  const maxVisible = isSmUp ? MAX_VISIBLE_PAGES_DESKTOP : MAX_VISIBLE_PAGES_MOBILE;
  const pageNumbers = getPageNumbers(currentPage, totalPages, maxVisible);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  if (totalPages <= 1 && totalItems <= pageSize) return null;

  return (
    <div className="flex w-full min-w-0 flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 px-3 py-2 sm:px-6 sm:py-3 border-t border-gray-200 bg-card-background">
      <p className="text-[10px] sm:text-sm text-primary order-2 sm:order-1 text-center sm:text-left">
        Showing <span className="font-medium">{startItem}</span>–<span className="font-medium">{endItem}</span> of{" "}
        <span className="font-medium">{totalItems}</span>
      </p>
      <nav
        className="flex w-full min-w-0 max-w-full flex-wrap items-center justify-center gap-1 sm:w-auto sm:flex-nowrap sm:justify-end sm:gap-2 order-1 sm:order-2"
        aria-label="Pagination"
      >
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="inline-flex shrink-0 items-center justify-center h-7 min-w-7 sm:min-w-[2.25rem] sm:h-9 px-2 sm:px-3 rounded-lg sm:rounded-xl border border-gray-200 bg-white text-xs sm:text-sm font-medium text-primary hover:bg-button-secondary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
          aria-label="Previous page"
          title="Previous page"
        >
          <span className="text-base leading-none sm:hidden" aria-hidden>
            ‹
          </span>
          <span className="hidden sm:inline">Previous</span>
        </button>
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-0.5 sm:flex-nowrap">
          {pageNumbers.map((page, i) =>
            page === "ellipsis" ? (
              <span
                key={i < pageNumbers.length / 2 ? "ellipsis-start" : "ellipsis-end"}
                className="px-0.5 sm:px-2 text-primary text-xs sm:text-sm"
                aria-hidden
              >
                …
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                disabled={page === currentPage}
                className={`inline-flex min-w-7 sm:min-w-[2.25rem] h-7 sm:h-9 items-center justify-center px-1 sm:px-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer ${page === currentPage
                    ? "bg-button-primary text-white cursor-default"
                    : "border border-gray-200 bg-white text-primary hover:bg-button-secondary"
                  }`}
                aria-label={page === currentPage ? `Page ${page} (current)` : `Page ${page}`}
                aria-current={page === currentPage ? "page" : undefined}
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
          className="inline-flex shrink-0 items-center justify-center h-7 min-w-7 sm:min-w-[2.25rem] sm:h-9 px-2 sm:px-3 rounded-lg sm:rounded-xl border border-gray-200 bg-white text-xs sm:text-sm font-medium text-primary hover:bg-button-secondary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
          aria-label="Next page"
          title="Next page"
        >
          <span className="text-base leading-none sm:hidden" aria-hidden>
            ›
          </span>
          <span className="hidden sm:inline">Next</span>
        </button>
      </nav>
    </div>
  );
};
