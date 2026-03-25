import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import ViewIcon from "@assets/icons/view.svg?react";
import { reviewService } from "../../services/review.service";
import { Pagination } from "../common/Pagination";
import { Spinner } from "../common/Spinner";
import { sortPastReviewCyclesByRecentFirst } from "../../utils/reviewCycleHelpers";
import { getStatusColor, getStatusLabel } from "../../types/review.types";
import type { ReviewCycle } from "../../types/review.types";
import type { RootState } from "../../store/store";

const PAGE_SIZE = 10;

export interface EmployeePastReviewsListModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly employeeId: string | null;
  readonly onViewCycle: (cycleId: string) => void;
}

export function EmployeePastReviewsListModal({
  isOpen,
  onClose,
  employeeId,
  onViewCycle,
}: EmployeePastReviewsListModalProps) {
  const currentLocation = useSelector((s: RootState) => s.location.currentLocation);
  const [loading, setLoading] = useState(false);
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!isOpen || !employeeId?.trim()) {
      setCycles([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params: Record<string, string> = {
          pastOnly: "true",
          employeeId: employeeId.trim(),
          limit: "100",
        };
        if (currentLocation?._id) params.locationId = currentLocation._id;
        const res = await reviewService.getCycles(params);
        const sorted = sortPastReviewCyclesByRecentFirst(res.cycles);
        if (!cancelled) {
          setCycles(sorted);
          setPage(1);
        }
      } catch {
        if (!cancelled) {
          toast.error("Failed to load past reviews");
          setCycles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, employeeId, currentLocation?._id]);

  const totalPages = Math.max(1, Math.ceil(cycles.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return cycles.slice(start, start + PAGE_SIZE);
  }, [cycles, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[350] grid place-items-center bg-black/50 p-4">
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
            <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">Past reviews for employee</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden border-x border-gray-200 flex flex-col">
            {loading ? (
              <div className="flex flex-1 min-h-[200px] items-center justify-center py-12">
                <Spinner size="lg" className="text-button-primary" />
              </div>
            ) : cycles.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10 px-5">No past reviews for this employee.</p>
            ) : (
              <>
                <div className="md:hidden flex-1 min-h-0 overflow-y-auto divide-y divide-gray-200">
                  {pageRows.map((c, i) => {
                    const globalIndex = (page - 1) * PAGE_SIZE + i;
                    const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                    const periodStart = c.referenceDate ? new Date(c.referenceDate).toLocaleDateString() : "—";
                    const periodEnd = c.dueDate90 ? new Date(c.dueDate90).toLocaleDateString() : "—";
                    const name = emp ? `${emp.firstName} ${emp.lastName}` : "—";
                    const cardBg = globalIndex % 2 === 0 ? "bg-white" : "bg-gray-50/50";
                    return (
                      <div key={c._id} className={`${cardBg} px-4 py-4 flex flex-col gap-3`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-primary truncate" title={name}>
                            {name}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            <span className="font-medium">Cycle:</span> #{c.cycleNumber}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5 flex flex-wrap items-center gap-1">
                            <span className="font-medium">Status:</span>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${getStatusColor(c.status)}`}
                            >
                              {getStatusLabel(c.status)}
                            </span>
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            <span className="font-medium">Period:</span> {periodStart} – {periodEnd}
                          </p>
                        </div>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              onViewCycle(c._id);
                              onClose();
                            }}
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
                      {pageRows.map((c, i) => {
                        const globalIndex = (page - 1) * PAGE_SIZE + i;
                        const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                        const periodStart = c.referenceDate ? new Date(c.referenceDate).toLocaleDateString() : "—";
                        const periodEnd = c.dueDate90 ? new Date(c.dueDate90).toLocaleDateString() : "—";
                        return (
                          <tr key={c._id} className={globalIndex % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                            <td className="py-3 pr-2 pl-2">{emp ? `${emp.firstName} ${emp.lastName}` : "—"}</td>
                            <td className="py-3 pr-2 text-center">#{c.cycleNumber}</td>
                            <td className="py-3 pr-2 text-center">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${getStatusColor(c.status)}`}
                              >
                                {getStatusLabel(c.status)}
                              </span>
                            </td>
                            <td className="py-3 pr-2 text-center whitespace-nowrap">
                              {periodStart} - {periodEnd}
                            </td>
                            <td className="py-3 pr-2 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  onViewCycle(c._id);
                                  onClose();
                                }}
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
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={cycles.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
