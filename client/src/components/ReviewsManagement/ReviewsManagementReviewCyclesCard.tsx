import ViewIcon from "@assets/icons/view.svg?react";
import SearchIcon from "@assets/icons/search.svg?react";
import { Spinner } from "../common/Spinner";
import { TimesheetLocationLabel } from "../../utils/timesheetLocationLabel";
import { employeeInitials, getUserProfileProxyImageUrl } from "../../utils/employeeBioHelpers";
import { getDirectorReviewStageLabel, getStageStatuses } from "../../types/review.types";
import type { ReviewCycle } from "../../types/review.types";
import { StageBadge } from "./StageBadge";

export const ReviewsManagementReviewCyclesCard = (props: {
  loading: boolean;
  activeListLoading: boolean;
  activeListTotal: number;
  reviewCyclesSearchInput: string;
  reviewCyclesSearchDebounced: string;
  setReviewCyclesSearchInput: (v: string) => void;
  activePreviewCycles: ReviewCycle[];
  allLocationsSelected: boolean;
  currentUserId: string | null;
  isDirector: boolean;
  isOwner: boolean;
  canOpenActionForStatus: (status: ReviewCycle["status"]) => boolean;
  onViewProgress: (cycleId: string) => void;
  onOpenAction: (cycle: ReviewCycle) => void;
  onViewAll: () => void;
}) => {
  const {
    loading,
    activeListLoading,
    activeListTotal,
    reviewCyclesSearchInput,
    reviewCyclesSearchDebounced,
    setReviewCyclesSearchInput,
    activePreviewCycles,
    allLocationsSelected,
    currentUserId,
    isDirector,
    isOwner,
    canOpenActionForStatus,
    onViewProgress,
    onOpenAction,
    onViewAll,
  } = props;

  return (
    <div className="mb-6">
      <div className="min-h-0 flex flex-col">
        <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden flex flex-col h-full min-h-0">
          <div className="rounded-t-xl bg-primary px-5 py-2 md:py-2 flex-shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">
              Review Cycles
            </h3>
            <label className="sr-only" htmlFor="review-cycles-search">
              Search review cycles by employee name
            </label>
            <div className="relative w-full min-w-0 sm:max-w-[220px] md:max-w-xs">
              <SearchIcon
                className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 md:w-3 md:h-3 2xl:w-3.5 2xl:h-3.5 text-secondary shrink-0 pointer-events-none"
                aria-hidden
              />
              <input
                id="review-cycles-search"
                type="search"
                value={reviewCyclesSearchInput}
                onChange={(e) => setReviewCyclesSearchInput(e.target.value)}
                placeholder="Search by name…"
                autoComplete="off"
                className="search-input-gray-clear w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-gray-300/50"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {loading || activeListLoading ? (
              <div
                className="flex flex-1 min-h-[220px] items-center justify-center px-5 py-12"
                aria-busy="true"
              >
                <Spinner size="lg" className="text-button-primary" />
              </div>
            ) : activeListTotal === 0 && reviewCyclesSearchDebounced ? (
              <p className="text-sm text-gray-500 text-center py-8 px-5 flex-1 flex items-center justify-center min-h-[200px]">
                No review cycles match this search.
              </p>
            ) : activeListTotal === 0 ? (
              <div className="flex flex-1 min-h-[200px] items-center justify-center px-5 py-12">
                <div className="text-center text-gray-400">
                  <p className="text-lg font-medium">No review cycles found</p>
                  <p className="text-sm mt-1">
                    Review cycles will appear here once employees are enrolled.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0 flex-1">
                  {activePreviewCycles.map((c, i) => {
                    const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                    const employeeId =
                      typeof c.employeeId === "object" ? c.employeeId._id : c.employeeId;
                    const avatarUrl = emp
                      ? getUserProfileProxyImageUrl(emp._id, emp.profileImagePublicId)
                      : null;
                    const initials = emp ? employeeInitials(emp) : "?";
                    const canViewProgress =
                      currentUserId != null &&
                      (isOwner || isDirector || employeeId === currentUserId);
                    const canOpenAction = canOpenActionForStatus(c.status);
                    const stages = getStageStatuses(c.status);
                    const name = emp ? `${emp.firstName} ${emp.lastName}` : "—";
                    const cardBg = i % 2 === 0 ? "bg-white" : "bg-gray-50/50";

                    return (
                      <div
                        key={c._id}
                        className={`${cardBg} px-4 py-4 flex flex-col gap-3`}
                      >
                        <div className="min-w-0">
                          <p
                            className="flex items-center gap-2 text-sm font-medium text-primary truncate"
                            title={name}
                          >
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt=""
                                className="w-8 h-8 rounded-full object-cover shrink-0 bg-gray-100"
                              />
                            ) : (
                              <span className="w-8 h-8 rounded-full bg-button-primary text-white flex items-center justify-center text-sm font-semibold shrink-0">
                                {initials}
                              </span>
                            )}
                            <span className="truncate">{name}</span>
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            <span className="font-medium">Cycle:</span> #{c.cycleNumber}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            <span className="font-medium">Start date:</span>{" "}
                            {new Date(c.referenceDate).toLocaleDateString()}
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-gray-600">
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">Self:</span>{" "}
                              <StageBadge label={stages.selfReview} />
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">Manager:</span>{" "}
                              <StageBadge label={stages.managerReview} />
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">DO:</span>{" "}
                              <StageBadge label={getDirectorReviewStageLabel(c)} />
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">Final:</span>{" "}
                              <StageBadge label={stages.finalReview} />
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">30d:</span>{" "}
                              <StageBadge label={stages.checkin30} />
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">60d:</span>{" "}
                              <StageBadge label={stages.checkin60} />
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          {canViewProgress && (
                            <button
                              type="button"
                              onClick={() => onViewProgress(c._id)}
                              className="p-2 text-primary hover:bg-gray-200 rounded transition-colors"
                              aria-label="View cycle progress"
                              title="View cycle progress"
                            >
                              <ViewIcon className="w-4 h-4" />
                            </button>
                          )}
                          {canOpenAction && (
                            <button
                              type="button"
                              onClick={() => onOpenAction(c)}
                              className="px-3 py-1.5 text-xs font-medium bg-button-primary text-white rounded-md hover:opacity-90 cursor-pointer"
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block p-5 overflow-x-auto flex-1 min-h-0">
                  <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm min-w-[800px]">
                    <thead>
                      <tr className="text-left text-secondary border-b border-gray-200">
                        <th className="pb-3 pr-2 pl-2 font-semibold">Employee</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Cycle</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Start Date</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">
                          Self Review
                        </th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">
                          Manager Review
                        </th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">
                          DO Review
                        </th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">
                          Final Review
                        </th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">
                          30 Day Check-in
                        </th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">
                          60 Day Check-in
                        </th>
                        <th className="pb-3 pr-2 font-semibold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-primary">
                      {activePreviewCycles.map((c, i) => {
                        const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                        const employeeId =
                          typeof c.employeeId === "object" ? c.employeeId._id : c.employeeId;
                        const locLabel = allLocationsSelected
                          ? c.locationName?.trim()
                          : undefined;
                        const roleLabel = emp?.role?.trim() || "—";
                        const avatarUrl = emp
                          ? getUserProfileProxyImageUrl(emp._id, emp.profileImagePublicId)
                          : null;
                        const initials = emp ? employeeInitials(emp) : "?";
                        const canViewProgress =
                          currentUserId != null &&
                          (isOwner || isDirector || employeeId === currentUserId);
                        const canOpenAction = canOpenActionForStatus(c.status);
                        const stages = getStageStatuses(c.status);

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
                            <td className="py-3 pr-2 text-center whitespace-nowrap">
                              {new Date(c.referenceDate).toLocaleDateString()}
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <StageBadge label={stages.selfReview} />
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <StageBadge label={stages.managerReview} />
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <StageBadge label={getDirectorReviewStageLabel(c)} />
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <StageBadge label={stages.finalReview} />
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <StageBadge label={stages.checkin30} />
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <StageBadge label={stages.checkin60} />
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <div className="inline-flex items-center justify-center gap-2">
                                {canViewProgress && (
                                  <button
                                    type="button"
                                    onClick={() => onViewProgress(c._id)}
                                    className="p-1.5 text-button-primary hover:bg-blue-50 rounded cursor-pointer"
                                    aria-label="View cycle progress"
                                    title="View cycle progress"
                                  >
                                    <ViewIcon className="w-4 h-4" />
                                  </button>
                                )}
                                {canOpenAction && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenAction(c)}
                                    className="px-3 py-1 text-xs bg-button-primary text-white rounded-md hover:opacity-90 cursor-pointer"
                                  >
                                    Open
                                  </button>
                                )}
                              </div>
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

          {!loading && !activeListLoading && activeListTotal > 0 && (
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

