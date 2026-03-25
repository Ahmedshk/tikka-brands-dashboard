import { useState, useEffect, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import toast from "react-hot-toast";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { Pagination } from "../../components/common/Pagination";
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
import ViewIcon from "@assets/icons/view.svg?react";
import { useCanAccessComponent } from "../../hooks/useCanAccessComponent";

const PAGE_ID = "reviews-management";
const CARD_ROW_LIMIT = 5;
const MODAL_PAGE_SIZE = 10;

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
  "self_review_submitted", "manager_review_due", "manager_review_pending", "manager_review_past_due",
]);
const DIRECTOR_STATUSES = new Set<ReviewCycleStatus>([
  "manager_review_submitted", "director_approval_due", "director_approval_pending", "director_approval_past_due",
]);
const SHARING_STATUSES = new Set<ReviewCycleStatus>([
  "approved", "sharing_due", "sharing_pending", "sharing_past_due",
]);
const CHECKIN_30_STATUSES = new Set<ReviewCycleStatus>(["checkin_30_due", "checkin_30_past_due"]);
const CHECKIN_60_STATUSES = new Set<ReviewCycleStatus>(["checkin_60_due", "checkin_60_past_due"]);

const STAGE_LABELS = {
  selfReview: ["Upcoming", "75-Day Notice Sent", "Form Available", "Due", "Late", "Past due", "Complete"],
  managerReview: ["—", "Due", "Past due", "Complete"],
  directorReview: ["—", "Due", "Past due", "Complete"],
  finalReview: ["—", "Due", "Past due", "Complete"],
  checkin30: ["—", "Due", "Past due", "Complete"],
  checkin60: ["—", "Due", "Past due", "Complete"],
} as const;
const STAGE_TITLES: Record<keyof typeof STAGE_LABELS, string> = {
  selfReview: "Self Review",
  managerReview: "Manager Review",
  directorReview: "DO Review",
  finalReview: "Final Review",
  checkin30: "30 Day Check-in",
  checkin60: "60 Day Check-in",
};
/** Single green for completed / approved segments across all review tracker donuts. */
const REVIEW_TRACKER_COMPLETE_COLOR = "#5DC54F";
/** Neutral segment (e.g. “—” on non–self-review donuts); “Upcoming” on self review uses the same grey. */
const REVIEW_TRACKER_NEUTRAL_GRAY = "#9CA3AF";
const getTrackerColorDefault = (label: string): string => {
  if (label === "—") return REVIEW_TRACKER_NEUTRAL_GRAY;
  if (label === "Past due" || label === "Late" || label === "Rejected") return "#EF4444";
  if (label === "Due" || label === "Pending" || label === "Form Available" || label === "Upcoming" || label === "75-Day Notice Sent") return "#FBC52A";
  if (label === "Complete" || label === "Done" || label === "Approved") return REVIEW_TRACKER_COMPLETE_COLOR;
  return REVIEW_TRACKER_NEUTRAL_GRAY;
};
const getSelfReviewTrackerColor = (label: string): string => {
  if (label === "Complete") return REVIEW_TRACKER_COMPLETE_COLOR;
  if (label === "Past due") return "#EF4444"; // red
  if (label === "Late") return "#F59E0B"; // yellow
  if (label === "Due") return "#FBC52A"; // yellow (consistent with other Due labels)
  if (label === "Form Available") return "#06B6D4"; // cyan
  if (label === "Upcoming") return REVIEW_TRACKER_NEUTRAL_GRAY;
  if (label === "75-Day Notice Sent") return "#EC4899"; // pink
  if (label === "—") return REVIEW_TRACKER_NEUTRAL_GRAY;
  return REVIEW_TRACKER_NEUTRAL_GRAY;
};
/** Excluded from “Review cycles” until 60-day check-in is finished (`cycle_complete` / terminal). */
const CLOSED_CYCLE_STATUSES = new Set<ReviewCycleStatus>([
  "checkin_60_complete",
  "checkin_60_done",
  "cycle_complete",
  "cycle_superseded",
  "rejected",
]);

export const ReviewsManagement = () => {
  const currentLocation = useSelector((s: RootState) => s.location.currentLocation);
  const user = useSelector((s: RootState) => s.auth.user);

  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [pastPreviewCycles, setPastPreviewCycles] = useState<ReviewCycle[]>([]);
  const [pastListTotal, setPastListTotal] = useState(0);
  const [pastModalCycles, setPastModalCycles] = useState<ReviewCycle[]>([]);
  const [pastModalLoading, setPastModalLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pastListLoading, setPastListLoading] = useState(true);
  const [settings, setSettings] = useState<ReviewSettings | null>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [pastDetailCycleId, setPastDetailCycleId] = useState<string | null>(null);
  const [detailViewType, setDetailViewType] = useState<"past" | "active">("past");
  const [showAllReviewCycles, setShowAllReviewCycles] = useState(false);
  const [showAllPastReviews, setShowAllPastReviews] = useState(false);
  const [pastReviewsSearchInput, setPastReviewsSearchInput] = useState("");
  const [pastReviewsSearchDebounced, setPastReviewsSearchDebounced] = useState("");
  const [reviewCyclesSearchInput, setReviewCyclesSearchInput] = useState("");
  const [reviewCyclesSearchDebounced, setReviewCyclesSearchDebounced] = useState("");
  const [activePreviewCycles, setActivePreviewCycles] = useState<ReviewCycle[]>([]);
  const [activeListTotal, setActiveListTotal] = useState(0);
  const [activeModalCycles, setActiveModalCycles] = useState<ReviewCycle[]>([]);
  const [activeModalLoading, setActiveModalLoading] = useState(false);
  const [activeListLoading, setActiveListLoading] = useState(true);
  const [reviewCyclesPage, setReviewCyclesPage] = useState(1);
  const [pastReviewsPage, setPastReviewsPage] = useState(1);

  const canStaffList = useCanAccessComponent(PAGE_ID, "staff-list");
  const canReviewTracker = useCanAccessComponent(PAGE_ID, "review-tracker-chart");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        activeOnly: "true",
        page: "1",
        limit: "100",
      };
      if (currentLocation?._id) params.locationId = currentLocation._id;
      const [cyclesRes, settingsRes] = await Promise.all([
        reviewService.getCycles(params),
        reviewService.getSettings().catch(() => null),
      ]);
      setCycles(cyclesRes.cycles);
      setSettings(settingsRes);
    } catch {
      toast.error("Failed to load review data");
    } finally {
      setLoading(false);
    }
  }, [currentLocation?._id]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPastReviewsSearchDebounced(pastReviewsSearchInput.trim());
    }, 400);
    return () => window.clearTimeout(t);
  }, [pastReviewsSearchInput]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setReviewCyclesSearchDebounced(reviewCyclesSearchInput.trim());
    }, 400);
    return () => window.clearTimeout(t);
  }, [reviewCyclesSearchInput]);

  const loadActiveCyclesPreview = useCallback(async (search: string, signal?: AbortSignal) => {
    setActiveListLoading(true);
    try {
      const params: Record<string, string> = {
        activeOnly: "true",
        page: "1",
        limit: String(CARD_ROW_LIMIT),
      };
      if (currentLocation?._id) params.locationId = currentLocation._id;
      if (search) params.search = search;
      const res = await reviewService.getCycles(params, { signal });
      if (signal?.aborted) return;
      setActivePreviewCycles(res.cycles);
      setActiveListTotal(res.total);
    } catch (e: unknown) {
      if (axios.isCancel(e) || (e as { code?: string })?.code === "ERR_CANCELED") return;
      if (signal?.aborted) return;
      toast.error("Failed to load review cycles");
      setActivePreviewCycles([]);
      setActiveListTotal(0);
    } finally {
      if (!signal?.aborted) setActiveListLoading(false);
    }
  }, [currentLocation?._id]);

  const loadActiveCyclesModalPage = useCallback(
    async (page: number, search: string, signal?: AbortSignal) => {
      setActiveModalLoading(true);
      try {
        const params: Record<string, string> = {
          activeOnly: "true",
          page: String(page),
          limit: String(MODAL_PAGE_SIZE),
        };
        if (currentLocation?._id) params.locationId = currentLocation._id;
        if (search) params.search = search;
        const res = await reviewService.getCycles(params, { signal });
        if (signal?.aborted) return;
        setActiveModalCycles(res.cycles);
        setActiveListTotal(res.total);
      } catch (e: unknown) {
        if (axios.isCancel(e) || (e as { code?: string })?.code === "ERR_CANCELED") return;
        if (signal?.aborted) return;
        toast.error("Failed to load review cycles");
        setActiveModalCycles([]);
      } finally {
        if (!signal?.aborted) setActiveModalLoading(false);
      }
    },
    [currentLocation?._id],
  );

  const loadPastReviews = useCallback(async (search: string, signal?: AbortSignal) => {
    setPastListLoading(true);
    try {
      const params: Record<string, string> = {
        pastOnly: "true",
        page: "1",
        limit: String(CARD_ROW_LIMIT),
      };
      if (currentLocation?._id) params.locationId = currentLocation._id;
      if (search) params.search = search;
      const pastRes = await reviewService.getCycles(params, { signal });
      if (signal?.aborted) return;
      setPastPreviewCycles(pastRes.cycles);
      setPastListTotal(pastRes.total);
    } catch (e: unknown) {
      if (axios.isCancel(e) || (e as { code?: string })?.code === "ERR_CANCELED") return;
      if (signal?.aborted) return;
      toast.error("Failed to load past reviews");
      setPastPreviewCycles([]);
      setPastListTotal(0);
    } finally {
      if (!signal?.aborted) setPastListLoading(false);
    }
  }, [currentLocation?._id]);

  const loadPastModalPage = useCallback(
    async (page: number, search: string, signal?: AbortSignal) => {
      setPastModalLoading(true);
      try {
        const params: Record<string, string> = {
          pastOnly: "true",
          page: String(page),
          limit: String(MODAL_PAGE_SIZE),
        };
        if (currentLocation?._id) params.locationId = currentLocation._id;
        if (search) params.search = search;
        const res = await reviewService.getCycles(params, { signal });
        if (signal?.aborted) return;
        setPastModalCycles(res.cycles);
        setPastListTotal(res.total);
      } catch (e: unknown) {
        if (axios.isCancel(e) || (e as { code?: string })?.code === "ERR_CANCELED") return;
        if (signal?.aborted) return;
        toast.error("Failed to load past reviews");
        setPastModalCycles([]);
      } finally {
        if (!signal?.aborted) setPastModalLoading(false);
      }
    },
    [currentLocation?._id],
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadPastReviews(pastReviewsSearchDebounced, ac.signal);
    return () => ac.abort();
  }, [pastReviewsSearchDebounced, loadPastReviews]);

  useEffect(() => {
    const ac = new AbortController();
    void loadActiveCyclesPreview(reviewCyclesSearchDebounced, ac.signal);
    return () => ac.abort();
  }, [reviewCyclesSearchDebounced, loadActiveCyclesPreview]);

  useEffect(() => {
    if (!showAllPastReviews) return;
    const ac = new AbortController();
    void loadPastModalPage(pastReviewsPage, pastReviewsSearchDebounced, ac.signal);
    return () => ac.abort();
  }, [showAllPastReviews, pastReviewsPage, pastReviewsSearchDebounced, loadPastModalPage]);

  useEffect(() => {
    if (!showAllReviewCycles) return;
    const ac = new AbortController();
    void loadActiveCyclesModalPage(reviewCyclesPage, reviewCyclesSearchDebounced, ac.signal);
    return () => ac.abort();
  }, [showAllReviewCycles, reviewCyclesPage, reviewCyclesSearchDebounced, loadActiveCyclesModalPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const userRoleId = user?.roleId ?? null;
  const currentUserId = user?._id ?? null;

  const matchesRole = (roleRef: string | { _id: string; name: string }) =>
    userRoleId != null && (typeof roleRef === "object" ? roleRef._id : roleRef) === userRoleId;

  const isEmployee = settings?.employeeRoleIds.some(matchesRole) ?? false;
  const isManager = settings?.managerRoleIds.some(matchesRole) ?? false;
  const isDirector = settings?.directorRoleIds.some(matchesRole) ?? false;

  const activeCycles = useMemo(
    () => cycles.filter((c) => !CLOSED_CYCLE_STATUSES.has(c.status)),
    [cycles],
  );
  const reviewCyclesTotalPages = Math.max(1, Math.ceil(activeListTotal / MODAL_PAGE_SIZE));
  const pastReviewsTotalPages = Math.max(1, Math.ceil(pastListTotal / MODAL_PAGE_SIZE));

  useEffect(() => {
    setPastReviewsPage(1);
  }, [pastReviewsSearchDebounced]);

  useEffect(() => {
    setReviewCyclesPage(1);
  }, [reviewCyclesSearchDebounced]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(pastListTotal / MODAL_PAGE_SIZE));
    if (pastReviewsPage > maxPage) setPastReviewsPage(maxPage);
  }, [pastListTotal, pastReviewsPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(activeListTotal / MODAL_PAGE_SIZE));
    if (reviewCyclesPage > maxPage) setReviewCyclesPage(maxPage);
  }, [activeListTotal, reviewCyclesPage]);

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
        const rawLabel = stages[stageKey];
        const label =
          stageKey === "directorReview" && (rawLabel === "Approved" || rawLabel === "Rejected")
            ? "Complete"
            : (stageKey === "managerReview" || stageKey === "directorReview" || stageKey === "finalReview") &&
              rawLabel === "Pending"
              ? "Due"
              : rawLabel;
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
        color: stageKey === "selfReview" ? getSelfReviewTrackerColor(label) : getTrackerColorDefault(label),
      })),
    }));
  }, [activeCycles]);

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

  const handleRefresh = useCallback(() => {
    void fetchData();
    const acPastPreview = new AbortController();
    void loadPastReviews(pastReviewsSearchDebounced, acPastPreview.signal);
    const acActivePreview = new AbortController();
    void loadActiveCyclesPreview(reviewCyclesSearchDebounced, acActivePreview.signal);
    if (showAllPastReviews) {
      const acPastModal = new AbortController();
      void loadPastModalPage(pastReviewsPage, pastReviewsSearchDebounced, acPastModal.signal);
    }
    if (showAllReviewCycles) {
      const acActiveModal = new AbortController();
      void loadActiveCyclesModalPage(reviewCyclesPage, reviewCyclesSearchDebounced, acActiveModal.signal);
    }
  }, [
    fetchData,
    loadPastReviews,
    loadPastModalPage,
    loadActiveCyclesPreview,
    loadActiveCyclesModalPage,
    pastReviewsSearchDebounced,
    reviewCyclesSearchDebounced,
    showAllPastReviews,
    showAllReviewCycles,
    pastReviewsPage,
    reviewCyclesPage,
  ]);

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

            {canReviewTracker && trackerDonuts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6 items-stretch">
                {trackerDonuts.map((donut) => (
                  <div key={donut.id} className="min-h-0 flex flex-col">
                    <ReviewTrackerCard donut={donut} loading={loading} />
                  </div>
                ))}
              </div>
            )}

            <div className="mb-6">
                <div className="min-h-0 flex flex-col">
                  <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden flex flex-col h-full min-h-0">
                    <div className="rounded-t-xl bg-primary px-5 py-2 md:py-2 flex-shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">Review Cycles</h3>
                      <label className="sr-only" htmlFor="review-cycles-search">
                        Search review cycles by employee name
                      </label>
                      <input
                        id="review-cycles-search"
                        type="search"
                        value={reviewCyclesSearchInput}
                        onChange={(e) => setReviewCyclesSearchInput(e.target.value)}
                        placeholder="Search by name…"
                        autoComplete="off"
                        className="search-input-gray-clear w-full min-w-0 sm:max-w-[220px] md:max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-gray-300/50"
                      />
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                      {loading || activeListLoading ? (
                        <div className="flex flex-1 min-h-[220px] items-center justify-center px-5 py-12" aria-busy="true">
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
                            <p className="text-sm mt-1">Review cycles will appear here once employees are enrolled.</p>
                          </div>
                        </div>
                      ) : (
                      <>
                      {/* Mobile: card list (matches User Management pattern) */}
                      <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0 flex-1">
                        {activePreviewCycles.map((c, i) => {
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
                          const name = emp ? `${emp.firstName} ${emp.lastName}` : "—";
                          const cardBg = i % 2 === 0 ? "bg-white" : "bg-gray-50/50";
                          return (
                            <div key={c._id} className={`${cardBg} px-4 py-4 flex flex-col gap-3`}>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-primary truncate" title={name}>
                                  {name}
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
                                    <span className="font-medium shrink-0">Self:</span> {badge(stages.selfReview)}
                                  </p>
                                  <p className="flex flex-wrap items-center gap-1 min-w-0">
                                    <span className="font-medium shrink-0">Manager:</span> {badge(stages.managerReview)}
                                  </p>
                                  <p className="flex flex-wrap items-center gap-1 min-w-0">
                                    <span className="font-medium shrink-0">DO:</span> {badge(stages.directorReview)}
                                  </p>
                                  <p className="flex flex-wrap items-center gap-1 min-w-0">
                                    <span className="font-medium shrink-0">Final:</span> {badge(stages.finalReview)}
                                  </p>
                                  <p className="flex flex-wrap items-center gap-1 min-w-0">
                                    <span className="font-medium shrink-0">30d:</span> {badge(stages.checkin30)}
                                  </p>
                                  <p className="flex flex-wrap items-center gap-1 min-w-0">
                                    <span className="font-medium shrink-0">60d:</span> {badge(stages.checkin60)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                {canViewProgress && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDetailViewType("active");
                                      setPastDetailCycleId(c._id);
                                    }}
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
                                    onClick={() => openAction(c)}
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
                      {/* Desktop: table */}
                      <div className="hidden md:block p-5 overflow-x-auto flex-1 min-h-0">
                        <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm min-w-[800px]">
                          <thead>
                            <tr className="text-left text-secondary border-b border-gray-200">
                              <th className="pb-3 pr-2 pl-2 font-semibold">Employee</th>
                              <th className="pb-3 pr-2 font-semibold text-center">Cycle</th>
                              <th className="pb-3 pr-2 font-semibold text-center">Start Date</th>
                              <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">Self Review</th>
                              <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">Manager Review</th>
                              <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">DO Review</th>
                              <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">Final Review</th>
                              <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">30 Day Check-in</th>
                              <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">60 Day Check-in</th>
                              <th className="pb-3 pr-2 font-semibold text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="text-primary">
                            {activePreviewCycles.map((c, i) => {
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
                                    {new Date(c.referenceDate).toLocaleDateString()}
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
                      </>
                      )}
                    </div>
                    {!loading && !activeListLoading && activeListTotal > 0 && (
                    <div className="px-5 pb-5 flex justify-end flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setReviewCyclesPage(1);
                          setShowAllReviewCycles(true);
                        }}
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

            {canStaffList && (
              <div className="grid grid-cols-1 gap-6 mb-6 items-stretch">
                <div className="min-h-0 flex flex-col">
                  <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden flex flex-col h-full min-h-0">
                    <div className="rounded-t-xl bg-primary px-5 py-2 md:py-2 flex-shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white shrink-0">Past Reviews</h3>
                      <label className="sr-only" htmlFor="past-reviews-search">
                        Search past reviews by employee name
                      </label>
                      <input
                        id="past-reviews-search"
                        type="search"
                        value={pastReviewsSearchInput}
                        onChange={(e) => setPastReviewsSearchInput(e.target.value)}
                        placeholder="Search by name…"
                        autoComplete="off"
                        className="search-input-gray-clear w-full min-w-0 sm:max-w-[220px] md:max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-gray-300/50"
                      />
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                      {pastListLoading ? (
                        <div className="flex flex-1 min-h-[220px] items-center justify-center px-5 py-12" aria-busy="true">
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
                          {/* Mobile: card list (matches User Management pattern) */}
                          <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0">
                            {pastPreviewCycles.map((c, i) => {
                              const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                              const periodStart = c.referenceDate ? new Date(c.referenceDate).toLocaleDateString() : "—";
                              const periodEnd = c.dueDate90 ? new Date(c.dueDate90).toLocaleDateString() : "—";
                              const name = emp ? `${emp.firstName} ${emp.lastName}` : "—";
                              const cardBg = i % 2 === 0 ? "bg-white" : "bg-gray-50/50";
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
                                        setDetailViewType("past");
                                        setPastDetailCycleId(c._id);
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
                          {/* Desktop: table */}
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
                                  const periodStart = c.referenceDate ? new Date(c.referenceDate).toLocaleDateString() : "—";
                                  const periodEnd = c.dueDate90 ? new Date(c.dueDate90).toLocaleDateString() : "—";
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
                                        {periodStart} - {periodEnd}
                                      </td>
                                      <td className="py-3 pr-2 text-center">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDetailViewType("past");
                                            setPastDetailCycleId(c._id);
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
                        </>
                      )}
                    </div>
                    {!loading && !pastListLoading && pastListTotal > 0 && (
                    <div className="px-5 pb-5 flex justify-end flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setPastReviewsPage(1);
                          setShowAllPastReviews(true);
                        }}
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
            )}

      </div>

      {showAllReviewCycles && (
        <div className="fixed inset-0 z-[300] grid place-items-center bg-black/50 p-4">
          <div className="relative w-full max-w-6xl">
            <button
              type="button"
              onClick={() => setShowAllReviewCycles(false)}
              className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Close"
              title="Close"
            >
              <span className="text-xl leading-none">×</span>
            </button>
            <div className="max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">All Review Cycles</h3>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden border-x border-gray-200 flex flex-col">
                {activeModalLoading ? (
                  <div className="flex flex-1 min-h-[200px] items-center justify-center py-12">
                    <Spinner size="lg" className="text-button-primary" />
                  </div>
                ) : activeListTotal === 0 && reviewCyclesSearchDebounced ? (
                  <p className="text-sm text-gray-500 text-center py-10 px-5">No review cycles match this search.</p>
                ) : activeListTotal === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-10 px-5">No review cycles found.</p>
                ) : (
                <>
                <div className="md:hidden flex-1 min-h-0 overflow-y-auto divide-y divide-gray-200">
                  {activeModalCycles.map((c, i) => {
                    const globalIndex = (reviewCyclesPage - 1) * MODAL_PAGE_SIZE + i;
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
                          <p className="text-xs text-gray-600 mt-0.5">
                            <span className="font-medium">Start date:</span>{" "}
                            {new Date(c.referenceDate).toLocaleDateString()}
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-gray-600">
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">Self:</span> {badge(stages.selfReview)}
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">Manager:</span> {badge(stages.managerReview)}
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">DO:</span> {badge(stages.directorReview)}
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">Final:</span> {badge(stages.finalReview)}
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">30d:</span> {badge(stages.checkin30)}
                            </p>
                            <p className="flex flex-wrap items-center gap-1 min-w-0">
                              <span className="font-medium shrink-0">60d:</span> {badge(stages.checkin60)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          {canViewProgress && (
                            <button
                              type="button"
                              onClick={() => {
                                setDetailViewType("active");
                                setPastDetailCycleId(c._id);
                                setShowAllReviewCycles(false);
                              }}
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
                              onClick={() => {
                                openAction(c);
                                setShowAllReviewCycles(false);
                              }}
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
                <div className="hidden md:block flex-1 min-h-0 overflow-auto px-5 pt-4">
                  <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm min-w-[800px]">
                    <thead>
                      <tr className="text-left text-secondary border-b border-gray-200">
                        <th className="pb-3 pr-2 pl-2 font-semibold">Employee</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Cycle</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Start Date</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">Self Review</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">Manager Review</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">DO Review</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">Final Review</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">30 Day Check-in</th>
                        <th className="pb-3 pr-2 font-semibold text-center whitespace-nowrap">60 Day Check-in</th>
                        <th className="pb-3 pr-2 font-semibold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-primary">
                      {activeModalCycles.map((c, i) => {
                        const globalIndex = (reviewCyclesPage - 1) * MODAL_PAGE_SIZE + i;
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
                          <tr key={c._id} className={globalIndex % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                            <td className="py-3 pr-2 pl-2">{emp ? `${emp.firstName} ${emp.lastName}` : "—"}</td>
                            <td className="py-3 pr-2 text-center">#{c.cycleNumber}</td>
                            <td className="py-3 pr-2 text-center whitespace-nowrap">
                              {new Date(c.referenceDate).toLocaleDateString()}
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
                                      setShowAllReviewCycles(false);
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
                                    onClick={() => {
                                      openAction(c);
                                      setShowAllReviewCycles(false);
                                    }}
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
              {!activeModalLoading && activeListTotal > 0 ? (
              <Pagination
                currentPage={reviewCyclesPage}
                totalPages={reviewCyclesTotalPages}
                totalItems={activeListTotal}
                pageSize={MODAL_PAGE_SIZE}
                onPageChange={setReviewCyclesPage}
              />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showAllPastReviews && (
        <div className="fixed inset-0 z-[300] grid place-items-center bg-black/50 p-4">
          <div className="relative w-full max-w-4xl">
            <button
              type="button"
              onClick={() => setShowAllPastReviews(false)}
              className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Close"
              title="Close"
            >
              <span className="text-xl leading-none">×</span>
            </button>
            <div className="max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
                <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">All Past Reviews</h3>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden border-x border-gray-200 flex flex-col">
                {pastModalLoading ? (
                  <div className="flex flex-1 min-h-[200px] items-center justify-center py-12">
                    <Spinner size="lg" className="text-button-primary" />
                  </div>
                ) : pastListTotal === 0 && pastReviewsSearchDebounced ? (
                  <p className="text-sm text-gray-500 text-center py-10 px-5">No reviews match this search.</p>
                ) : pastListTotal === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-10 px-5">No Past Review cycles yet.</p>
                ) : (
                  <>
                    <div className="md:hidden flex-1 min-h-0 overflow-y-auto divide-y divide-gray-200">
                      {pastModalCycles.map((c, i) => {
                        const globalIndex = (pastReviewsPage - 1) * MODAL_PAGE_SIZE + i;
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
                                  setDetailViewType("past");
                                  setPastDetailCycleId(c._id);
                                  setShowAllPastReviews(false);
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
                          {pastModalCycles.map((c, i) => {
                            const globalIndex = (pastReviewsPage - 1) * MODAL_PAGE_SIZE + i;
                            const emp = typeof c.employeeId === "object" ? c.employeeId : null;
                            const periodStart = c.referenceDate ? new Date(c.referenceDate).toLocaleDateString() : "—";
                            const periodEnd = c.dueDate90 ? new Date(c.dueDate90).toLocaleDateString() : "—";
                            return (
                              <tr key={c._id} className={globalIndex % 2 === 1 ? "bg-[#F3F5F7]" : ""}>
                                <td className="py-3 pr-2 pl-2">{emp ? `${emp.firstName} ${emp.lastName}` : "—"}</td>
                                <td className="py-3 pr-2 text-center">#{c.cycleNumber}</td>
                                <td className="py-3 pr-2 text-center">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${getStatusColor(c.status)}`}>
                                    {getStatusLabel(c.status)}
                                  </span>
                                </td>
                                <td className="py-3 pr-2 text-center whitespace-nowrap">{periodStart} - {periodEnd}</td>
                                <td className="py-3 pr-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDetailViewType("past");
                                      setPastDetailCycleId(c._id);
                                      setShowAllPastReviews(false);
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
                  </>
                )}
              </div>
              {!pastModalLoading && pastListTotal > 0 ? (
                <Pagination
                  currentPage={pastReviewsPage}
                  totalPages={pastReviewsTotalPages}
                  totalItems={pastListTotal}
                  pageSize={MODAL_PAGE_SIZE}
                  onPageChange={setPastReviewsPage}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

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
        onSelectPastCycleId={(id) => {
          setDetailViewType("past");
          setPastDetailCycleId(id);
        }}
      />
    </Layout>
  );
};
