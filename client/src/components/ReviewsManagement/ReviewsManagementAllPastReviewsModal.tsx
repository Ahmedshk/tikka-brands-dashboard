import ViewIcon from "@assets/icons/view.svg?react";
import { Spinner } from "../common/Spinner";
import { Pagination } from "../common/Pagination";
import type { ReviewCycle } from "../../types/review.types";
import { TimesheetLocationLabel } from "../../utils/timesheetLocationLabel";
import { employeeInitials, getUserProfileProxyImageUrl } from "../../utils/employeeBioHelpers";
import { StatusBadge } from "./StatusBadge";

const MODAL_PAGE_SIZE = 10;

export const ReviewsManagementAllPastReviewsModal = (props: {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  total: number;
  search: string;
  cycles: ReviewCycle[];
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  isMultiLocationView: boolean;
  onViewPastDetail: (cycleId: string) => void;
}) => {
  const {
    isOpen,
    onClose,
    loading,
    total,
    search,
    cycles,
    page,
    totalPages,
    onPageChange,
    isMultiLocationView,
    onViewPastDetail,
  } = props;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/50 p-4">
      <div className="relative w-full max-w-4xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-xl leading-none">×</span>
        </button>
        <div className="max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              All Past Reviews
            </h3>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden border-x border-gray-200 flex flex-col">
            {loading ? (
              <div className="flex flex-1 min-h-[200px] items-center justify-center py-12">
                <Spinner size="lg" className="text-button-primary" />
              </div>
            ) : total === 0 && search ? (
              <p className="text-sm text-gray-500 text-center py-10 px-5">
                No reviews match this search.
              </p>
            ) : total === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10 px-5">
                No Past Review cycles yet.
              </p>
            ) : (
              <>
                <div className="md:hidden flex-1 min-h-0 overflow-y-auto divide-y divide-gray-200">
                  {cycles.map((c, i) => {
                    const globalIndex = (page - 1) * MODAL_PAGE_SIZE + i;
                    const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                    const periodStart = c.referenceDate
                      ? new Date(c.referenceDate).toLocaleDateString()
                      : "—";
                    const periodEnd = c.dueDate90
                      ? new Date(c.dueDate90).toLocaleDateString()
                      : "—";
                    const name = emp ? `${emp.firstName} ${emp.lastName}` : "—";
                    const cardBg = globalIndex % 2 === 0 ? "bg-white" : "bg-gray-50/50";

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

                <div className="hidden md:block flex-1 min-h-0 overflow-auto px-5 pt-4">
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
                      {cycles.map((c, i) => {
                        const globalIndex = (page - 1) * MODAL_PAGE_SIZE + i;
                        const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                        const locLabel = isMultiLocationView
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
                          <tr
                            key={c._id}
                            className={globalIndex % 2 === 1 ? "bg-[#F3F5F7]" : ""}
                          >
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

          {!loading && total > 0 ? (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={MODAL_PAGE_SIZE}
              onPageChange={onPageChange}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

