import { useState, useEffect, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Layout } from "../../components/common/Layout";
import { CommandCenterKPICards } from "../../components/CommandCenter";
import {
  ReviewTrackerCard,
  type ReviewTrackerDonut,
} from "../../components/TrainingReviews";
import { SelfReviewModal } from "../../components/modal/SelfReviewModal";
import { ManagerReviewModal } from "../../components/modal/ManagerReviewModal";
import { DirectorApprovalModal } from "../../components/modal/DirectorApprovalModal";
import { ReviewSharingModal } from "../../components/modal/ReviewSharingModal";
import { CheckInModal } from "../../components/modal/CheckInModal";
import { PastReviewDetailModal } from "../../components/modal/PastReviewDetailModal";
import { reviewService } from "../../services/review.service";
import {
  getStageStatuses,
  getStageStatusColor,
  getStatusColor,
  getStatusLabel,
} from "../../types/review.types";
import type {
  ReviewCycle,
  ReviewCycleStatus,
  ReviewSettings,
} from "../../types/review.types";
import type { RootState } from "../../store/store";
import TeamHrIcon from "@assets/icons/team_and_hr.svg?react";
import OfficeStaffIcon from "@assets/icons/office_staff.svg?react";
import ReviewsDueIcon from "@assets/icons/reviews_due.svg?react";
import ViewIcon from "@assets/icons/view.svg?react";
import { useCanAccessComponent } from "../../hooks/useCanAccessComponent";

const PAGE_ID = "reviews-management";

type ModalType =
  | { kind: "self-review"; cycle: ReviewCycle }
  | { kind: "manager-review"; cycle: ReviewCycle }
  | { kind: "director-approval"; cycle: ReviewCycle }
  | { kind: "sharing"; cycle: ReviewCycle }
  | { kind: "checkin"; cycle: ReviewCycle; period: "30" | "60" }
  | null;

const SELF_REVIEW_STATUSES = new Set<ReviewCycleStatus>([
  "form_available_85", "self_review_due", "self_review_late", "self_review_past_due",
]);
const MANAGER_REVIEW_STATUSES = new Set<ReviewCycleStatus>([
  "self_review_submitted", "manager_review_pending", "manager_review_past_due",
]);
const DIRECTOR_STATUSES = new Set<ReviewCycleStatus>([
  "manager_review_submitted", "director_approval_pending", "director_approval_past_due",
]);
const SHARING_STATUSES = new Set<ReviewCycleStatus>([
  "approved", "sharing_pending", "sharing_past_due",
]);
const CHECKIN_30_STATUSES = new Set<ReviewCycleStatus>(["checkin_30_due", "checkin_30_past_due"]);
const CHECKIN_60_STATUSES = new Set<ReviewCycleStatus>(["checkin_60_due", "checkin_60_past_due"]);

const STAGE_LABELS = {
  selfReview: ["Upcoming", "75-Day Notice Sent", "Form Available", "Due", "Late", "Past due", "Complete"],
  managerReview: ["—", "Pending", "Past due", "Complete"],
  directorReview: ["—", "Pending", "Past due", "Approved", "Rejected", "Complete"],
  finalReview: ["—", "Pending", "Past due", "Complete"],
  checkin30: ["—", "Due", "Past due", "Done"],
  checkin60: ["—", "Due", "Past due", "Done"],
} as const;
const STAGE_TITLES: Record<keyof typeof STAGE_LABELS, string> = {
  selfReview: "Self Review",
  managerReview: "Manager Review",
  directorReview: "DO Review",
  finalReview: "Final Review",
  checkin30: "30 Day Check-in",
  checkin60: "60 Day Check-in",
};
const getTrackerColor = (label: string): string => {
  if (label === "—") return "#9CA3AF";
  if (label === "Past due" || label === "Late" || label === "Rejected") return "#EF4444";
  if (label === "Due" || label === "Pending" || label === "Form Available" || label === "Upcoming" || label === "75-Day Notice Sent") return "#FBC52A";
  if (label === "Complete" || label === "Done" || label === "Approved") return "#5DC54F";
  return "#9CA3AF";
};
const CLOSED_CYCLE_STATUSES = new Set<ReviewCycleStatus>([
  "completed",
  "checkin_60_done",
  "cycle_complete",
  "cycle_superseded",
  "rejected",
]);

export const ReviewsManagement = () => {
  const currentLocation = useSelector((s: RootState) => s.location.currentLocation);
  const user = useSelector((s: RootState) => s.auth.user);

  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [pastCycles, setPastCycles] = useState<ReviewCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [pastDetailCycleId, setPastDetailCycleId] = useState<string | null>(null);
  const [detailViewType, setDetailViewType] = useState<"past" | "active">("past");

  const canOfficeStaff = useCanAccessComponent(PAGE_ID, "kpi-office-staff");
  const canReviewsDue = useCanAccessComponent(PAGE_ID, "kpi-reviews-due");
  const canStaffList = useCanAccessComponent(PAGE_ID, "staff-list");
  const canReviewTracker = useCanAccessComponent(PAGE_ID, "review-tracker-chart");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (currentLocation?._id) params.locationId = currentLocation._id;
      const pastParams = { ...params, pastOnly: "true", limit: "100" };
      const [cyclesRes, pastRes, settingsRes] = await Promise.all([
        reviewService.getCycles(params),
        reviewService.getCycles(pastParams).catch(() => ({ cycles: [] as ReviewCycle[], total: 0 })),
        reviewService.getSettings().catch(() => null),
      ]);
      setCycles(cyclesRes.cycles);
      setPastCycles(pastRes.cycles);
      setSettings(settingsRes);
    } catch {
      toast.error("Failed to load review data");
    } finally {
      setLoading(false);
    }
  }, [currentLocation?._id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const userRoleId = user?.roleId ?? null;
  const currentUserId = user?._id ?? null;

  const matchesRole = (roleRef: string | { _id: string; name: string }) =>
    userRoleId != null && (typeof roleRef === "object" ? roleRef._id : roleRef) === userRoleId;

  const isEmployee = settings?.employeeRoleIds.some(matchesRole) ?? false;
  const isManager = settings?.managerRoleIds.some(matchesRole) ?? false;
  const isDirector = settings?.directorRoleIds.some(matchesRole) ?? false;

  const dueCount = useMemo(
    () => cycles.filter((c) => c.status.includes("due") || c.status.includes("pending") || c.status.includes("late")).length,
    [cycles],
  );
  const totalCount = cycles.length;
  const activeCycles = useMemo(
    () => cycles.filter((c) => !CLOSED_CYCLE_STATUSES.has(c.status)),
    [cycles],
  );
  const trackerDonuts: ReviewTrackerDonut[] = useMemo(() => {
    type StageKey = keyof typeof STAGE_LABELS;
    const stageKeys = Object.keys(STAGE_LABELS) as StageKey[];
    const countsByStage = stageKeys.reduce((acc, stageKey) => {
      const initCounts = Object.fromEntries(STAGE_LABELS[stageKey].map((label) => [label, 0]));
      acc[stageKey] = initCounts as Record<string, number>;
      return acc;
    }, {} as Record<StageKey, Record<string, number>>);

    activeCycles.forEach((cycle) => {
      const stages = getStageStatuses(cycle.status);
      stageKeys.forEach((stageKey) => {
        const label = stages[stageKey];
        countsByStage[stageKey][label] = (countsByStage[stageKey][label] ?? 0) + 1;
      });
    });

    return stageKeys.map((stageKey) => ({
      id: stageKey,
      title: STAGE_TITLES[stageKey],
      total: activeCycles.length,
      segments: STAGE_LABELS[stageKey].map((label) => ({
        id: `${stageKey}-${label}`,
        label,
        count: countsByStage[stageKey][label] ?? 0,
        color: getTrackerColor(label),
      })),
    }));
  }, [activeCycles]);

  const kpiItems = useMemo(() => {
    const items: { title: string; value: string; accentColor: "blue" | "gold"; rightIcon: React.ReactNode }[] = [];
    if (canOfficeStaff)
      items.push({
        title: "Staff in Review",
        value: String(totalCount),
        accentColor: "blue",
        rightIcon: <OfficeStaffIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      });
    if (canReviewsDue)
      items.push({
        title: "Reviews Due",
        value: String(dueCount),
        accentColor: "gold",
        rightIcon: <ReviewsDueIcon className="w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9 text-white" />,
      });
    return items;
  }, [canOfficeStaff, canReviewsDue, totalCount, dueCount]);


  const openAction = (cycle: ReviewCycle) => {
    const s = cycle.status;
    if (isEmployee && SELF_REVIEW_STATUSES.has(s)) {
      setModal({ kind: "self-review", cycle });
    } else if (isManager && MANAGER_REVIEW_STATUSES.has(s)) {
      setModal({ kind: "manager-review", cycle });
    } else if (isDirector && DIRECTOR_STATUSES.has(s)) {
      setModal({ kind: "director-approval", cycle });
    } else if (isManager && SHARING_STATUSES.has(s)) {
      setModal({ kind: "sharing", cycle });
    } else if (isManager && CHECKIN_30_STATUSES.has(s)) {
      setModal({ kind: "checkin", cycle, period: "30" });
    } else if (isManager && CHECKIN_60_STATUSES.has(s)) {
      setModal({ kind: "checkin", cycle, period: "60" });
    } else if (
      isManager &&
      (s === "upcoming" || s === "notification_sent_75" || s === "form_available_85")
    ) {
      toast("Waiting for employee to complete self-review");
    } else {
      toast("No action available for this status");
    }
  };

  const handleRefresh = () => { fetchData(); };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <TeamHrIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Reviews Management
          </h2>
          {!loading && settings && !settings.isConfigured && (
            <span className="text-xs text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
              Review settings not configured
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-button-primary" />
          </div>
        ) : (
          <>
            {kpiItems.length > 0 && <CommandCenterKPICards items={kpiItems} />}

            {/* Active cycles table */}
            {activeCycles.length > 0 && (
              <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden mb-6">
                <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2">
                  <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">Review Cycles</h3>
                </div>
                <div className="p-5 overflow-x-auto">
                  <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm min-w-[800px]">
                    <thead>
                      <tr className="text-left text-secondary border-b border-gray-200">
                        <th className="pb-3 pr-2 pl-2 font-semibold">Employee</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Cycle</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Due Date</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">Self Review</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">Manager Review</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">DO Review</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">Final Review</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">30 Day Plan</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">60 Day Plan</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-primary">
                      {activeCycles.map((c, i) => {
                        const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                        const employeeId = typeof c.employeeId === "object" ? c.employeeId._id : c.employeeId;
                        const isOwner = user?.role === "Owner";
                        const canViewProgress =
                          currentUserId != null && (isOwner || isDirector || employeeId === currentUserId);
                        const canOpenAction =
                          (isEmployee && SELF_REVIEW_STATUSES.has(c.status)) ||
                          (isManager && MANAGER_REVIEW_STATUSES.has(c.status)) ||
                          (isDirector && DIRECTOR_STATUSES.has(c.status)) ||
                          (isManager && SHARING_STATUSES.has(c.status)) ||
                          (isManager && CHECKIN_30_STATUSES.has(c.status)) ||
                          (isManager && CHECKIN_60_STATUSES.has(c.status)) ||
                          (isManager && (c.status === "upcoming" || c.status === "notification_sent_75" || c.status === "form_available_85"));
                        const stages = getStageStatuses(c.status);
                        const badge = (label: string) => (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${getStageStatusColor(label)}`}>
                            {label}
                          </span>
                        );
                        return (
                          <tr key={c._id} className={i % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                            <td className="py-3 pr-2 pl-2">
                              {emp ? `${emp.firstName} ${emp.lastName}` : "—"}
                            </td>
                            <td className="py-3 pr-2 text-center">#{c.cycleNumber}</td>
                            <td className="py-3 pr-2 text-center whitespace-nowrap">
                              {new Date(c.dueDate90).toLocaleDateString()}
                            </td>
                            <td className="py-3 pr-2 text-center">{badge(stages.selfReview)}</td>
                            <td className="py-3 pr-2 text-center">{badge(stages.managerReview)}</td>
                            <td className="py-3 pr-2 text-center">{badge(stages.directorReview)}</td>
                            <td className="py-3 pr-2 text-center">{badge(stages.finalReview)}</td>
                            <td className="py-3 pr-2 text-center">{badge(stages.checkin30)}</td>
                            <td className="py-3 pr-2 text-center">{badge(stages.checkin60)}</td>
                            <td className="py-3 pr-2 text-center">
                              <div className="inline-flex items-center justify-center gap-2">
                                {canViewProgress && (
                                  <button
                                    type="button"
                                      onClick={() => {
                                        setDetailViewType("active");
                                        setPastDetailCycleId(c._id);
                                      }}
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
                                    onClick={() => openAction(c)}
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
              </div>
            )}

            {(canStaffList || canReviewTracker) && (
              <div
                className={
                  canStaffList && canReviewTracker
                    ? "grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch"
                    : "grid grid-cols-1 gap-6 mb-6 items-stretch"
                }
              >
                {canStaffList && (
                  <div className={canReviewTracker ? "lg:col-span-2 min-h-0 flex flex-col" : "min-h-0 flex flex-col"}>
                    <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden flex flex-col h-full min-h-0">
                      <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex-shrink-0">
                        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">Past reviews</h3>
                      </div>
                      <div className="p-5 overflow-x-auto flex-1 min-h-0">
                        {pastCycles.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-8">No past review cycles yet.</p>
                        ) : (
                          <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm min-w-[640px]">
                            <thead>
                              <tr className="text-left text-secondary border-b border-gray-200">
                                <th className="pb-3 pr-2 pl-2 font-semibold">Employee</th>
                                <th className="pb-3 pr-2 font-semibold text-center">Cycle</th>
                                <th className="pb-3 pr-2 font-semibold text-center">Status</th>
                                <th className="pb-3 pr-2 font-semibold text-center">Due date</th>
                                <th className="pb-3 pr-2 font-semibold text-center">Updated</th>
                                <th className="pb-3 pr-2 font-semibold text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody className="text-primary">
                              {pastCycles.map((c, i) => {
                                const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                                return (
                                  <tr key={c._id} className={i % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                                    <td className="py-3 pr-2 pl-2">
                                      {emp ? `${emp.firstName} ${emp.lastName}` : "—"}
                                    </td>
                                    <td className="py-3 pr-2 text-center">#{c.cycleNumber}</td>
                                    <td className="py-3 pr-2 text-center">
                                      <span
                                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${getStatusColor(c.status)}`}
                                      >
                                        {getStatusLabel(c.status)}
                                      </span>
                                    </td>
                                    <td className="py-3 pr-2 text-center whitespace-nowrap">
                                      {c.dueDate90 ? new Date(c.dueDate90).toLocaleDateString() : "—"}
                                    </td>
                                    <td className="py-3 pr-2 text-center whitespace-nowrap">
                                      {c.updatedAt ? new Date(c.updatedAt).toLocaleDateString() : "—"}
                                    </td>
                                    <td className="py-3 pr-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDetailViewType("past");
                                          setPastDetailCycleId(c._id);
                                        }}
                                        className="px-3 py-1 text-xs bg-button-primary text-white rounded-md hover:opacity-90 cursor-pointer"
                                      >
                                        View
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {canReviewTracker && (
                  <div className={canStaffList ? "lg:col-span-1 min-h-0 flex flex-col" : "min-h-0 flex flex-col"}>
                    <ReviewTrackerCard donuts={trackerDonuts} />
                  </div>
                )}
              </div>
            )}

            {activeCycles.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-lg font-medium">No review cycles found</p>
                <p className="text-sm mt-1">Review cycles will appear here once employees are enrolled.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {modal?.kind === "self-review" && (
        <SelfReviewModal
          isOpen
          onClose={() => setModal(null)}
          cycleId={modal.cycle._id}
          status={modal.cycle.status}
          onSubmitted={handleRefresh}
        />
      )}
      {modal?.kind === "manager-review" && (
        <ManagerReviewModal
          isOpen
          onClose={() => setModal(null)}
          cycleId={modal.cycle._id}
          status={modal.cycle.status}
          onSubmitted={handleRefresh}
        />
      )}
      {modal?.kind === "director-approval" && (
        <DirectorApprovalModal
          isOpen
          onClose={() => setModal(null)}
          cycleId={modal.cycle._id}
          status={modal.cycle.status}
          onDecision={handleRefresh}
        />
      )}
      {modal?.kind === "sharing" && (
        <ReviewSharingModal
          isOpen
          onClose={() => setModal(null)}
          cycle={modal.cycle}
          onCompleted={handleRefresh}
        />
      )}
      {modal?.kind === "checkin" && (
        <CheckInModal
          isOpen
          onClose={() => setModal(null)}
          cycleId={modal.cycle._id}
          period={modal.period}
          status={modal.cycle.status}
          onSubmitted={handleRefresh}
        />
      )}

      <PastReviewDetailModal
        isOpen={pastDetailCycleId != null}
        onClose={() => {
          setPastDetailCycleId(null);
          setDetailViewType("past");
        }}
        cycleId={pastDetailCycleId}
        viewType={detailViewType}
      />
    </Layout>
  );
};
