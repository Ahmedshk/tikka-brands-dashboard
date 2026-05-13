import ViewIcon from "@assets/icons/view.svg?react";
import SearchIcon from "@assets/icons/search.svg?react";
import { Spinner } from "../common/Spinner";
import { TimesheetLocationLabel } from "../../utils/timesheetLocationLabel";
import { employeeInitials, getUserProfileProxyImageUrl } from "../../utils/employeeBioHelpers";
import type { ReviewCycle } from "../../types/review.types";
import { StatusBadge } from "./StatusBadge";

export const ReviewsManagementPastReviewsCard = (props: {
  pastListLoading: boolean;
  pastListTotal: number;
  pastReviewsSearchInput: string;
  pastReviewsSearchDebounced: string;
  setPastReviewsSearchInput: (v: string) => void;
  pastPreviewCycles: ReviewCycle[];
  allLocationsSelected: boolean;
  onViewPastDetail: (cycleId: string) => void;
  onViewAll: () => void;
}) => {
  const {
    pastListLoading,
    pastListTotal,
    pastReviewsSearchInput,
    pastReviewsSearchDebounced,
    setPastReviewsSearchInput,
    pastPreviewCycles,
    allLocationsSelected,
    onViewPastDetail,
    onViewAll,
  } = props;

  return (
    <div className="grid grid-cols-1 gap-6 mb-6 items-stretch">
      <div className="min-h-0 flex flex-col">
        <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden flex flex-col h-full min-h-0">
          <div className="rounded-t-xl bg-primary px-5 py-2 md:py-2 flex-shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">
              Past Reviews
            </h3>
            <label className="sr-only" htmlFor="past-reviews-search">
              Search past reviews by employee name
            </label>
            <div className="relative w-full min-w-0 sm:max-w-[220px] md:max-w-xs">
              <SearchIcon
                className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 text-secondary shrink-0 pointer-events-none"
                aria-hidden
              />
              <input
                id="past-reviews-search"
                type="search"
                value={pastReviewsSearchInput}
                onChange={(e) => setPastReviewsSearchInput(e.target.value)}
                placeholder="Search by name…"
                autoComplete="off"
                className="search-input-gray-clear w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-gray-300/50"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {pastListLoading ? (
              <div
                className="flex flex-1 min-h-[220px] items-center justify-center px-5 py-12"
                aria-busy="true"
              >
                <Spinner size="lg" className="text-button-primary" />
              </div>
            ) : pastListTotal === 0 && pastReviewsSearchDebounced ? (
              <p className="text-sm text-gray-500 text-center py-8 px-5 flex-1 flex items-center justify-center min-h-[200px]">
                No reviews match this search.
              </p>
            ) : pastListTotal === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8 px-5 flex-1 flex items-center justify-center min-h-[200px]">
                No Past Review cycles yet.
              </p>
            ) : (
              <>
                <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0">
                  {pastPreviewCycles.map((c, i) => {
                    const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                    const periodStart = c.referenceDate
                      ? new Date(c.referenceDate).toLocaleDateString()
                      : "—";
                    const periodEnd = c.dueDate90
                      ? new Date(c.dueDate90).toLocaleDateString()
                      : "—";
                    const name = emp ? `${emp.firstName} ${emp.lastName}` : "—";
                    const cardBg = i % 2 === 0 ? "bg-white" : "bg-gray-50/50";

                    return (
                      <div
                        key={c._id}
                        className={`${cardBg} px-4 py-4 flex flex-col gap-3`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-primary truncate" title={name}>
                            {name}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            <span className="font-medium">Cycle:</span> #{c.cycleNumber}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5 flex flex-wrap items-center gap-1">
                            <span className="font-medium">Status:</span>
                            <StatusBadge status={c.status} />
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            <span className="font-medium">Period:</span> {periodStart} –{" "}
                            {periodEnd}
                          </p>
                        </div>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => onViewPastDetail(c._id)}
                            className="p-2 text-primary hover:bg-gray-200 rounded transition-colors"
                            aria-label="View Past Review"
                            title="View Past Review"
                          >
                            <ViewIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block p-5 overflow-x-auto flex-1 min-h-0">
                  <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left text-secondary border-b border-gray-200">
                        <th className="pb-3 pr-2 pl-2 font-semibold">Employee</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Cycle</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Status</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Period</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-primary">
                      {pastPreviewCycles.map((c, i) => {
                        const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                        const locLabel = allLocationsSelected
                          ? c.locationName?.trim()
                          : undefined;
                        const roleLabel = emp?.role?.trim() || "—";
                        const avatarUrl = emp
                          ? getUserProfileProxyImageUrl(emp._id, emp.profileImagePublicId)
                          : null;
                        const initials = emp ? employeeInitials(emp) : "?";
                        const periodStart = c.referenceDate
                          ? new Date(c.referenceDate).toLocaleDateString()
                          : "—";
                        const periodEnd = c.dueDate90
                          ? new Date(c.dueDate90).toLocaleDateString()
                          : "—";

                        return (
                          <tr key={c._id} className={i % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                            <td className="py-3 pr-2 pl-2">
                              {locLabel ? <TimesheetLocationLabel name={locLabel} /> : null}
                              <div className="flex items-center gap-2 min-w-0">
                                {avatarUrl ? (
                                  <img
                                    src={avatarUrl}
                                    alt=""
                                    className="w-8 h-8 rounded-full object-cover shrink-0 bg-gray-100"
                                  />
                                ) : (
                                  <span
                                    className="w-8 h-8 rounded-full bg-button-primary text-white flex items-center justify-center text-sm font-semibold shrink-0"
                                    aria-hidden
                                  >
                                    {initials}
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <div className="font-semibold text-primary truncate">
                                    {emp ? `${emp.firstName} ${emp.lastName}` : "—"}
                                  </div>
                                  <div className="text-primary text-[10px] md:text-[10px] 2xl:text-xs truncate">
                                    {roleLabel}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 pr-2 text-center">#{c.cycleNumber}</td>
                            <td className="py-3 pr-2 text-center">
                              <StatusBadge status={c.status} />
                            </td>
                            <td className="py-3 pr-2 text-center whitespace-nowrap">
                              {periodStart} - {periodEnd}
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <button
                                type="button"
                                onClick={() => onViewPastDetail(c._id)}
                                className="p-1.5 text-button-primary hover:bg-blue-50 rounded cursor-pointer"
                                aria-label="View Past Review"
                                title="View Past Review"
                              >
                                <ViewIcon className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {!pastListLoading && pastListTotal > 0 && (
            <div className="px-5 pb-5 flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={onViewAll}
                className="text-sm font-medium text-quaternary hover:underline bg-transparent border-0 cursor-pointer p-0"
                title="View all"
              >
                View All
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

