import { useState, useEffect, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import toast from "react-hot-toast";
import { Layout } from "../../components/common/Layout";
import { SelfReviewModal } from "../../components/modal/SelfReviewModal";
import { ManagerReviewModal } from "../../components/modal/ManagerReviewModal";
import { DirectorApprovalModal } from "../../components/modal/DirectorApprovalModal";
import { ReviewSharingModal } from "../../components/modal/ReviewSharingModal";
import { CheckInModal } from "../../components/modal/CheckInModal";
import { PastReviewDetailModal } from "../../components/modal/PastReviewDetailModal";
import { reviewService } from "../../services/review.service";
import type {
  ReviewCycle,
  ReviewCycleStatus,
  ReviewSettings,
} from "../../types/review.types";
import type { RootState } from "../../store/store";
import TeamHrIcon from "@assets/icons/team_and_hr.svg?react";
import { useReviewsManagementSectionAccess } from "../../utils/reviewsManagementPermissionHelpers";
import { buildReviewTrackerDonuts } from "../../utils/reviewsManagementTrackerHelpers";
import { getReviewsManagementAction } from "../../utils/reviewsManagementActionHelpers";
import {
  ReviewsManagementAllPastReviewsModal,
  ReviewsManagementAllReviewCyclesModal,
  ReviewsManagementPastReviewsCard,
  ReviewsManagementReviewCyclesCard,
  ReviewsManagementTrackerDonuts,
} from "../../components/ReviewsManagement";

const CARD_ROW_LIMIT = 5;
const MODAL_PAGE_SIZE = 10;

type ModalType =
  | { kind: "self-review"; cycle: ReviewCycle }
  | { kind: "manager-review"; cycle: ReviewCycle }
  | { kind: "director-approval"; cycle: ReviewCycle }
  | { kind: "sharing"; cycle: ReviewCycle }
  | { kind: "checkin"; cycle: ReviewCycle; period: "30" | "60" }
  | null;

/** Excluded from “Review cycles” until 60-day check-in is finished (`cycle_complete` / terminal). */
const CLOSED_CYCLE_STATUSES = new Set<ReviewCycleStatus>([
  "checkin_60_complete",
  "checkin_60_done",
  "cycle_complete",
  "cycle_superseded",
]);

export const ReviewsManagement = () => {
  const currentLocation = useSelector((s: RootState) => s.location.currentLocation);
  const allLocationsSelected = useSelector((s: RootState) => s.location.allLocationsSelected);
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
  /** Total active cycles (no name search) from the same fetch that powers tracker donuts — avoids a second activeOnly request when search is empty. */
  const [activeCyclesTotalUnfiltered, setActiveCyclesTotalUnfiltered] = useState(0);

  const { canShowDonut, canPastReviews, canReviewCycles } = useReviewsManagementSectionAccess();

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        activeOnly: "true",
        page: "1",
        limit: "100",
      };
      if (currentLocation?._id) params.locationId = currentLocation._id;
      const [cyclesRes, settingsRes] = await Promise.all([
        reviewService.getCycles(params, { signal }),
        reviewService.getSettings({ signal }).catch(() => null),
      ]);
      if (signal?.aborted) return;
      setCycles(cyclesRes.cycles);
      setActiveCyclesTotalUnfiltered(cyclesRes.total);
      setSettings(settingsRes);
    } catch (e: unknown) {
      if (axios.isCancel(e) || (e as { code?: string })?.code === "ERR_CANCELED") return;
      if (signal?.aborted) return;
      toast.error("Failed to load review data");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [currentLocation?._id]);

  useEffect(() => {
    const t = globalThis.setTimeout(() => {
      setPastReviewsSearchDebounced(pastReviewsSearchInput.trim());
    }, 400);
    return () => globalThis.clearTimeout(t);
  }, [pastReviewsSearchInput]);

  useEffect(() => {
    const t = globalThis.setTimeout(() => {
      setReviewCyclesSearchDebounced(reviewCyclesSearchInput.trim());
    }, 400);
    return () => globalThis.clearTimeout(t);
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
    const search = reviewCyclesSearchDebounced.trim();
    if (search !== "") return;
    setActivePreviewCycles(cycles.slice(0, CARD_ROW_LIMIT));
    setActiveListTotal(activeCyclesTotalUnfiltered);
    setActiveListLoading(false);
  }, [reviewCyclesSearchDebounced, cycles, activeCyclesTotalUnfiltered]);

  useEffect(() => {
    const search = reviewCyclesSearchDebounced.trim();
    if (search === "") return;
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

  useEffect(() => {
    const ac = new AbortController();
    void fetchData(ac.signal);
    return () => ac.abort();
  }, [fetchData]);

  const userRoleId = user?.roleId ?? null;
  const currentUserId = user?._id ?? null;

  const matchesRole = (roleRef: string | { _id: string; name: string }) =>
    userRoleId != null && (typeof roleRef === "object" ? roleRef._id : roleRef) === userRoleId;

  const isEmployee = settings?.employeeRoleIds.some(matchesRole) ?? false;
  const isManager = settings?.managerRoleIds.some(matchesRole) ?? false;
  const isDirector = settings?.directorRoleIds.some(matchesRole) ?? false;

  const activeCycles = useMemo(
    () => cycles.filter((c) => c.status !== "rejected" && !CLOSED_CYCLE_STATUSES.has(c.status)),
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

  const trackerDonuts = useMemo(() => buildReviewTrackerDonuts(activeCycles), [activeCycles]);

  const visibleTrackerDonuts = useMemo(
    () => trackerDonuts.filter((d) => canShowDonut(d.id)),
    [trackerDonuts, canShowDonut]
  );

  const canOpenActionForStatus = useCallback(
    (status: ReviewCycle["status"]) => {
      const action = getReviewsManagementAction({
        cycle: { status } as ReviewCycle,
        isEmployee,
        isManager,
        isDirector,
      });
      return action.type === "modal" || (isManager && action.type === "toast");
    },
    [isDirector, isEmployee, isManager],
  );

  const openAction = useCallback(
    (cycle: ReviewCycle) => {
      const action = getReviewsManagementAction({ cycle, isEmployee, isManager, isDirector });
      if (action.type === "modal") setModal(action.modal);
      else toast(action.message);
    },
    [isDirector, isEmployee, isManager],
  );

  const handleRefresh = useCallback(() => {
    void fetchData();
    const acPastPreview = new AbortController();
    void loadPastReviews(pastReviewsSearchDebounced, acPastPreview.signal);
    if (reviewCyclesSearchDebounced.trim() !== "") {
      const acActivePreview = new AbortController();
      void loadActiveCyclesPreview(reviewCyclesSearchDebounced, acActivePreview.signal);
    }
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

        <ReviewsManagementTrackerDonuts donuts={visibleTrackerDonuts} loading={loading} />

        {canReviewCycles() && (
          <ReviewsManagementReviewCyclesCard
            loading={loading}
            activeListLoading={activeListLoading}
            activeListTotal={activeListTotal}
            reviewCyclesSearchInput={reviewCyclesSearchInput}
            reviewCyclesSearchDebounced={reviewCyclesSearchDebounced}
            setReviewCyclesSearchInput={setReviewCyclesSearchInput}
            activePreviewCycles={activePreviewCycles}
            allLocationsSelected={allLocationsSelected}
            currentUserId={currentUserId}
            isDirector={isDirector}
            isOwner={user?.role === "Owner"}
            canOpenActionForStatus={canOpenActionForStatus}
            onViewProgress={(cycleId) => {
              setDetailViewType("active");
              setPastDetailCycleId(cycleId);
            }}
            onOpenAction={openAction}
            onViewAll={() => {
              setReviewCyclesPage(1);
              setShowAllReviewCycles(true);
            }}
          />
        )}

        {canPastReviews() && (
          <ReviewsManagementPastReviewsCard
            pastListLoading={pastListLoading}
            pastListTotal={pastListTotal}
            pastReviewsSearchInput={pastReviewsSearchInput}
            pastReviewsSearchDebounced={pastReviewsSearchDebounced}
            setPastReviewsSearchInput={setPastReviewsSearchInput}
            pastPreviewCycles={pastPreviewCycles}
            allLocationsSelected={allLocationsSelected}
            onViewPastDetail={(cycleId) => {
              setDetailViewType("past");
              setPastDetailCycleId(cycleId);
            }}
            onViewAll={() => {
              setPastReviewsPage(1);
              setShowAllPastReviews(true);
            }}
          />
        )}

      </div>

      {canReviewCycles() && (
        <ReviewsManagementAllReviewCyclesModal
          isOpen={showAllReviewCycles}
          onClose={() => setShowAllReviewCycles(false)}
          loading={activeModalLoading}
          total={activeListTotal}
          search={reviewCyclesSearchDebounced}
          cycles={activeModalCycles}
          page={reviewCyclesPage}
          totalPages={reviewCyclesTotalPages}
          onPageChange={setReviewCyclesPage}
          allLocationsSelected={allLocationsSelected}
          currentUserId={currentUserId}
          isDirector={isDirector}
          isOwner={user?.role === "Owner"}
          canOpenActionForStatus={canOpenActionForStatus}
          onViewProgress={(cycleId) => {
            setDetailViewType("active");
            setPastDetailCycleId(cycleId);
            setShowAllReviewCycles(false);
          }}
          onOpenAction={(cycle) => {
            openAction(cycle);
            setShowAllReviewCycles(false);
          }}
        />
      )}

      {canPastReviews() && (
        <ReviewsManagementAllPastReviewsModal
          isOpen={showAllPastReviews}
          onClose={() => setShowAllPastReviews(false)}
          loading={pastModalLoading}
          total={pastListTotal}
          search={pastReviewsSearchDebounced}
          cycles={pastModalCycles}
          page={pastReviewsPage}
          totalPages={pastReviewsTotalPages}
          onPageChange={setPastReviewsPage}
          allLocationsSelected={allLocationsSelected}
          onViewPastDetail={(cycleId) => {
            setDetailViewType("past");
            setPastDetailCycleId(cycleId);
            setShowAllPastReviews(false);
          }}
        />
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
        isOpen={
          pastDetailCycleId != null &&
          (detailViewType === "active" ? canReviewCycles() : canPastReviews())
        }
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
