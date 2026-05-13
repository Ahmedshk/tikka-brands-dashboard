import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import ViewIcon from "@assets/icons/view.svg?react";
import { getDocumentProxyUrl, openDocumentProxyInNewTab } from "../../services/training.service";
import { Spinner } from "../common/Spinner";
import { ReviewEmployeeBioSection } from "../review/ReviewEmployeeBioSection";
import { DocumentTypeThumbnail } from "./DocumentTypeThumbnail";
import { getDocumentFormatFromApiModuleFile } from "../../utils/createTrainingModalHelpers";
import {
  ACTION_PLAN_PERIODS,
  formatActionPlanScore,
  getCheckInProgressRows,
  getLegacyUrl,
  hasValidPublicId,
  isImageDoc,
} from "../../utils/pastReviewDetailModalHelpers";
import {
  formatMeritIncreaseDisplay,
  getStageStatuses,
  getStageStatusesFromSnapshot,
  getStageStatusColor,
  getStatusColor,
  getStatusLabel,
} from "../../types/review.types";
import {
  personLabelFromReviewRef,
  personRoleFromReviewRef,
  reviewEmployeeHeaderSubtitle,
} from "../../utils/employeeBioHelpers";
import { ReviewQuestionResponseList } from "../../utils/reviewQuestionResponseList";
import { ManagerReviewResponsesWithHistory } from "../review/ManagerReviewResponsesWithHistory";
import { getReviewCycleEmployeeId } from "../../utils/reviewCycleHelpers";
import { EmployeePastReviewsListModal } from "./EmployeePastReviewsListModal";
import { usePastReviewDetailData, usePastReviewDetailDialogLayer } from "../../utils/pastReviewDetailModalHooks";
import type { ReviewCycleSnapshot, ReviewCycleStatus, ReviewSettings } from "../../types/review.types";

function StagesSection({
  stages,
}: Readonly<{
  stages: ReturnType<typeof getStageStatuses> | ReturnType<typeof getStageStatusesFromSnapshot> | null;
}>) {
  if (!stages) return null;
  return (
    <section className="border border-gray-200 rounded-lg p-4 bg-gray-50/80">
      <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">Stages</h3>
      <div className="flex flex-wrap gap-2 text-[11px] md:text-xs">
        {(
          [
            ["Self review", stages.selfReview],
            ["Manager", stages.managerReview],
            ["Director", stages.directorReview],
            ["Final", stages.finalReview],
            ["30-day", stages.checkin30],
            ["60-day", stages.checkin60],
          ] as const
        ).map(([label, val]) => (
          <span
            key={label}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded font-medium ${getStageStatusColor(val)}`}
          >
            <span className="text-gray-600 font-normal">{label}:</span>
            {val}
          </span>
        ))}
      </div>
    </section>
  );
}

function ReviewsGridSection({
  snapshot,
  reviewSettings,
  cycle,
}: Readonly<{
  snapshot: ReviewCycleSnapshot;
  reviewSettings: ReviewSettings | null;
  cycle: ReviewCycleSnapshot["cycle"];
}>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <section className="bg-blue-50/50 rounded-lg p-4 border border-blue-100">
        <h3 className="text-sm font-semibold text-blue-800 mb-3">Self-review</h3>
        {snapshot.selfReview ? (
          <ReviewQuestionResponseList
            responses={snapshot.selfReview.responses ?? []}
            questionnaire={reviewSettings?.selfReviewQuestionnaire}
          />
        ) : (
          <p className="text-sm text-gray-400 italic">No self-review</p>
        )}
        {snapshot.selfReview?.submittedAt ? (
          <p className="text-xs text-gray-500 mt-3">
            Submitted {new Date(snapshot.selfReview.submittedAt).toLocaleString()}
          </p>
        ) : null}
      </section>

      <section className="bg-violet-50/50 rounded-lg p-4 border border-violet-100">
        <h3 className="text-sm font-semibold text-violet-800 mb-2">Manager review</h3>
        <p className="text-xs text-gray-600 mb-3">
          <span className="text-secondary">Reviewed by: </span>
          <span className="font-semibold text-gray-900">
            {personLabelFromReviewRef(cycle.reviewedByManagerId)}
          </span>
          {personRoleFromReviewRef(cycle.reviewedByManagerId) ? (
            <span className="text-gray-500">
              {" "}
              · {personRoleFromReviewRef(cycle.reviewedByManagerId)}
            </span>
          ) : null}
        </p>
        {snapshot.managerReview ? (
          <>
            <ManagerReviewResponsesWithHistory
              managerReview={snapshot.managerReview}
              questionnaire={reviewSettings?.managerReviewQuestionnaire}
              accent="violet"
            />
            {snapshot.managerReview.submittedAt ? (
              <p className="text-xs text-gray-500 mt-3">
                Submitted {new Date(snapshot.managerReview.submittedAt).toLocaleString()}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-gray-400 italic">No manager review</p>
        )}
      </section>
    </div>
  );
}

function DirectorSummarySection({
  cycle,
}: Readonly<{
  cycle: ReviewCycleSnapshot["cycle"];
}>) {
  const salaryDisplay = formatMeritIncreaseDisplay(cycle.salaryIncrement, cycle.salaryIncrementType);
  return (
    <section className="rounded-lg p-4 border border-amber-100 bg-amber-50/40">
      <h3 className="text-sm font-semibold text-amber-900 mb-3">Director</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-gray-500 text-xs">Decision</dt>
          <dd className="font-medium capitalize">{cycle.directorDecision ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Approved by</dt>
          <dd className="font-medium">
            {personLabelFromReviewRef(cycle.approvedByDirectorId)}
            {personRoleFromReviewRef(cycle.approvedByDirectorId) ? (
              <span className="text-gray-500 font-normal">
                {" "}
                · {personRoleFromReviewRef(cycle.approvedByDirectorId)}
              </span>
            ) : null}
          </dd>
        </div>
        {salaryDisplay ? (
          <div>
            <dt className="text-gray-500 text-xs">Salary increment</dt>
            <dd className="font-medium">{salaryDisplay}</dd>
          </div>
        ) : null}
      </dl>
      {cycle.directorComments ? (
        <div className="mt-3 text-sm">
          <span className="text-gray-500 text-xs block mb-1">Comments</span>
          <p className="text-gray-800 whitespace-pre-wrap">{cycle.directorComments}</p>
        </div>
      ) : null}
    </section>
  );
}

function ActionPlanSection({
  hasItems,
  actionPlanItems,
  otherActionPlanItems,
}: Readonly<{
  hasItems: boolean;
  actionPlanItems: Array<{ period?: unknown; description: string; targetScore?: unknown; currentScore?: unknown }>;
  otherActionPlanItems: Array<{ period?: unknown; description: string; targetScore?: unknown; currentScore?: unknown }>;
}>) {
  if (!hasItems) {
    return (
      <section className="rounded-lg p-4 border border-gray-200">
        <h3 className="text-sm font-semibold text-primary mb-3">Action plan</h3>
        <p className="text-sm text-gray-400 italic">No action plan</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg p-4 border border-gray-200">
      <h3 className="text-sm font-semibold text-primary mb-3">Action plan</h3>
      <div className="space-y-6">
        {ACTION_PLAN_PERIODS.map((period) => {
          const group = actionPlanItems.filter((i) => String(i.period) === period);
          if (group.length === 0) return null;
          return (
            <div key={period}>
              <h4 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2 border-b border-gray-200 pb-1">
                {period}-day actions
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left text-secondary border-b border-gray-200">
                      <th className="py-2 pr-2">Description</th>
                      <th className="py-2 pr-2">Target</th>
                      <th className="py-2">Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((item) => (
                      <tr
                        key={`${period}-${item.description}`}
                        className="odd:bg-gray-50"
                      >
                        <td className="py-2 pr-2">{item.description}</td>
                        <td className="py-2 pr-2">{formatActionPlanScore(item.targetScore)}</td>
                        <td className="py-2">{formatActionPlanScore(item.currentScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {otherActionPlanItems.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2 border-b border-gray-200 pb-1">
              Other
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-secondary border-b border-gray-200">
                    <th className="py-2 pr-2">Period</th>
                    <th className="py-2 pr-2">Description</th>
                    <th className="py-2 pr-2">Target</th>
                    <th className="py-2">Current</th>
                  </tr>
                </thead>
                <tbody>
                  {otherActionPlanItems.map((item) => (
                    <tr key={`other-${String(item.period)}-${item.description}`} className="odd:bg-gray-50">
                      <td className="py-2 pr-2 whitespace-nowrap">{String(item.period)} days</td>
                      <td className="py-2 pr-2">{item.description}</td>
                      <td className="py-2 pr-2">{formatActionPlanScore(item.targetScore)}</td>
                      <td className="py-2">{formatActionPlanScore(item.currentScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CheckInCard({
  ci,
  actionPlanItems,
}: Readonly<{
  ci: NonNullable<ReviewCycleSnapshot["checkIns"]>[number];
  actionPlanItems: Array<{ description: string; currentScore?: unknown; targetScore?: unknown }>;
}>) {
  const progressRows = getCheckInProgressRows(actionPlanItems, ci);
  const hasDocuments = (ci.documents?.length ?? 0) > 0;

  let documentsSection: ReactNode = null;
  if (hasDocuments) {
    documentsSection = (
      <div className="mt-3 space-y-1">
        <p className="text-sm font-medium text-gray-600">Documents:</p>
        <ul className="space-y-1 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {ci.documents?.map((doc, docIdx) => {
            const legacy = getLegacyUrl(doc);
            const showImage = isImageDoc(doc) && (hasValidPublicId(doc.publicId) || legacy);
            const publicId = doc.publicId;
            const imageSrc =
              publicId && hasValidPublicId(publicId) ? getDocumentProxyUrl(publicId, "image") : legacy ?? "";
            return (
              <li key={`${ci._id}-doc-${docIdx}`} className="flex items-center gap-2 px-3 py-1.5 min-w-0">
                {showImage ? (
                  <img
                    src={imageSrc}
                    alt=""
                    className="w-12 h-12 rounded object-cover border border-gray-200 flex-shrink-0"
                  />
                ) : (
                  <DocumentTypeThumbnail format={getDocumentFormatFromApiModuleFile(doc)} />
                )}
                <span className="text-sm text-primary truncate min-w-0 flex-1" title={doc.filename ?? "File"}>
                  {doc.filename?.trim() || `Document ${docIdx + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => handleOpenDoc(doc)}
                  className="p-1 text-primary hover:bg-gray-100 rounded shrink-0"
                  aria-label="View file"
                  title="View file"
                >
                  <ViewIcon className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  } else if (ci.documentUrl) {
    documentsSection = (
      <p className="mt-3">
        <a
          href={ci.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-button-primary underline"
        >
          View document
        </a>
      </p>
    );
  }

  const handleOpenDoc = (doc: { publicId?: string; resourceType?: string; filename?: string; url?: string }) => {
    if (hasValidPublicId(doc.publicId)) {
      openDocumentProxyInNewTab(
        doc.publicId!,
        doc.resourceType === "image" ? "image" : "raw",
        doc.filename,
      ).catch(() => {});
      return;
    }
    const legacyUrl = getLegacyUrl(doc);
    if (legacyUrl) window.open(legacyUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <li className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-sm font-semibold text-primary">{ci.period}-day check-in</span>
        <span className="text-xs text-gray-500">
          {ci.submittedAt ? new Date(ci.submittedAt).toLocaleString() : ""}
        </span>
      </div>
      <ReviewQuestionResponseList responses={ci.responses ?? []} />
      {progressRows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2">Current</th>
                <th className="py-2 pr-2">After {ci.period} days</th>
                <th className="py-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {progressRows.map(({ progress, planItem }) => (
                <tr
                  key={`${ci._id}-progress-${progress.actionPlanItemIndex}`}
                  className="odd:bg-gray-50"
                >
                  <td className="py-2 pr-2">{planItem.description}</td>
                  <td className="py-2 pr-2">{formatActionPlanScore(planItem.currentScore)}</td>
                  <td className="py-2 pr-2">{progress.value?.trim() || "N/A"}</td>
                  <td className="py-2">{formatActionPlanScore(planItem.targetScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {ci.managerComments ? (
        <p className="text-sm mt-3">
          <span className="font-medium text-gray-600">Manager comments: </span>
          <span className="text-gray-800 whitespace-pre-wrap">{ci.managerComments}</span>
        </p>
      ) : null}
      {ci.actionPlanProgress ? (
        <p className="text-sm mt-2">
          <span className="font-medium text-gray-600">Action plan progress: </span>
          <span className="text-gray-800 whitespace-pre-wrap">{ci.actionPlanProgress}</span>
        </p>
      ) : null}
      {documentsSection}
    </li>
  );
}

function CheckInsSection({
  checkIns,
  actionPlanItems,
}: Readonly<{
  checkIns: ReviewCycleSnapshot["checkIns"] | undefined;
  actionPlanItems: Array<{ description: string; currentScore?: unknown; targetScore?: unknown }>;
}>) {
  const hasCheckIns = Boolean(checkIns?.length);
  return (
    <section className="rounded-lg p-4 border border-gray-200">
      <h3 className="text-sm font-semibold text-primary mb-3">Check-ins</h3>
      {hasCheckIns ? (
        <ul className="space-y-4">
          {checkIns!.map((ci) => (
            <CheckInCard key={ci._id} ci={ci} actionPlanItems={actionPlanItems} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400 italic">No check-ins</p>
      )}
    </section>
  );
}

function PastReviewDetailDialog({
  dialogRef,
  handleDialogClose,
  loading,
  snapshot,
  reviewSettings,
  viewType,
  employeePastListOpen,
  setEmployeePastListOpen,
  onSelectPastCycleId,
}: Readonly<{
  dialogRef: RefObject<HTMLDialogElement | null>;
  handleDialogClose: () => void;
  loading: boolean;
  snapshot: ReviewCycleSnapshot | null;
  reviewSettings: ReviewSettings | null;
  viewType: "past" | "active";
  employeePastListOpen: boolean;
  setEmployeePastListOpen: (open: boolean) => void;
  onSelectPastCycleId?: (cycleId: string) => void;
}>) {
  const cycle = snapshot?.cycle;
  const employeeIdForPastList = getReviewCycleEmployeeId(cycle ?? null);
  const status = cycle?.status;
  const stages = useMemo(() => {
    if (!cycle || !snapshot) return null;
    if (cycle.status === "cycle_superseded") return getStageStatusesFromSnapshot(snapshot);
    return getStageStatuses(cycle.status as ReviewCycleStatus);
  }, [cycle, snapshot]);
  const emp = cycle && typeof cycle.employeeId === "object" ? cycle.employeeId : null;
  const employeeName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : "Employee";
  const pastReviewHeaderSubtitle = reviewEmployeeHeaderSubtitle(cycle ?? null);
  const employeeBioHeadingId =
    viewType === "active" ? "employee-review-detail-bio-heading" : "past-review-detail-bio-heading";

  const actionPlanItems = snapshot?.actionPlan?.items ?? [];
  const otherActionPlanItems = actionPlanItems.filter(
    (i) => !(ACTION_PLAN_PERIODS as readonly string[]).includes(String(i.period)),
  );

  const handleClose = () => {
    dialogRef.current?.close();
  };

  const canShowPastReviewsButton = loading ? false : Boolean(employeeIdForPastList && onSelectPastCycleId);

  return (
    <>
      {createPortal(
        <dialog
          ref={dialogRef}
          onClose={handleDialogClose}
          className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
          aria-labelledby="past-review-detail-modal-title"
        >
          <div className="relative w-full min-w-0 max-w-full md:max-w-5xl">
            <button
              type="button"
              onClick={handleClose}
              className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Close"
              title="Close"
            >
              <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
            </button>
            <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
              <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 pr-2">
                  <h2
                    id="past-review-detail-modal-title"
                    className="text-sm md:text-base 2xl:text-lg font-semibold text-white"
                  >
                    {viewType === "active" ? "Employee Review" : "Past Review"}
                  </h2>
                  {pastReviewHeaderSubtitle ? (
                    <p className="mt-1 text-xs md:text-sm text-white/90">
                      <span className="font-medium">{pastReviewHeaderSubtitle.name}</span>
                      {pastReviewHeaderSubtitle.role ? <span>{` · ${pastReviewHeaderSubtitle.role}`}</span> : null}
                    </p>
                  ) : null}
                </div>
                {canShowPastReviewsButton ? (
                  <button
                    type="button"
                    onClick={() => setEmployeePastListOpen(true)}
                    className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300/50 md:text-sm cursor-pointer"
                  >
                    All past reviews
                  </button>
                ) : null}
              </div>
              <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden border-x border-gray-200">
                {cycle ? (
                  <PastReviewTopMeta cycle={cycle} employeeName={employeeName} status={status} />
                ) : null}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-5 md:[scrollbar-gutter:stable]">
                  <PastReviewDetailBody
                    loading={loading}
                    snapshot={snapshot}
                    cycle={cycle}
                    employeeBioHeadingId={employeeBioHeadingId}
                    stages={stages}
                    reviewSettings={reviewSettings}
                    actionPlanItems={actionPlanItems}
                    otherActionPlanItems={otherActionPlanItems}
                  />
                </div>
              </div>
            </div>
          </div>
        </dialog>,
        document.body,
      )}
      <EmployeePastReviewsListModal
        isOpen={employeePastListOpen}
        onClose={() => setEmployeePastListOpen(false)}
        employeeId={employeeIdForPastList}
        onViewCycle={(id) => onSelectPastCycleId?.(id)}
      />
    </>
  );
}

function PastReviewTopMeta({
  cycle,
  employeeName,
  status,
}: Readonly<{
  cycle: ReviewCycleSnapshot["cycle"];
  employeeName: string;
  status: ReviewCycleStatus | undefined;
}>) {
  return (
    <div className="px-5 pt-4 pb-3 border-b border-gray-200 flex-shrink-0 bg-card-background">
      <p className="text-sm text-secondary">
        {cycle.cycleNumber == null ? (
          <span className="font-semibold text-primary">{employeeName}</span>
        ) : (
          <span className="font-semibold text-primary">{`Cycle #${cycle.cycleNumber}`}</span>
        )}
      </p>
      {status ? (
        <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(status)}`}>
          {getStatusLabel(status)}
        </span>
      ) : null}
    </div>
  );
}

function PastReviewDetailBody({
  loading,
  snapshot,
  cycle,
  employeeBioHeadingId,
  stages,
  reviewSettings,
  actionPlanItems,
  otherActionPlanItems,
}: Readonly<{
  loading: boolean;
  snapshot: ReviewCycleSnapshot | null;
  cycle: ReviewCycleSnapshot["cycle"] | undefined;
  employeeBioHeadingId: string;
  stages: ReturnType<typeof getStageStatuses> | ReturnType<typeof getStageStatusesFromSnapshot> | null;
  reviewSettings: ReviewSettings | null;
  actionPlanItems: Array<{ period?: unknown; description: string; targetScore?: unknown; currentScore?: unknown }>;
  otherActionPlanItems: Array<{ period?: unknown; description: string; targetScore?: unknown; currentScore?: unknown }>;
}>) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-button-primary" />
      </div>
    );
  }

  if (!snapshot || !cycle) {
    return <p className="text-sm text-gray-500 py-8 text-center">No data</p>;
  }

  return (
    <div className="space-y-6">
      <ReviewEmployeeBioSection cycle={cycle} sectionHeadingId={employeeBioHeadingId} />
      <StagesSection stages={stages} />

      <ReviewsGridSection snapshot={snapshot} reviewSettings={reviewSettings} cycle={cycle} />

      <DirectorSummarySection cycle={cycle} />

      <ActionPlanSection
        hasItems={Boolean(snapshot.actionPlan?.items?.length)}
        actionPlanItems={actionPlanItems}
        otherActionPlanItems={otherActionPlanItems}
      />

      <CheckInsSection checkIns={snapshot.checkIns} actionPlanItems={actionPlanItems} />

      <section className="text-xs text-gray-500 border-t pt-4">
        <p>
          Reference {cycle.referenceDate ? new Date(cycle.referenceDate).toLocaleDateString() : "—"}
          {" · "}
          Due (90d) {cycle.dueDate90 ? new Date(cycle.dueDate90).toLocaleDateString() : "—"}
        </p>
        {cycle.completedAt ? <p className="mt-1">Completed {new Date(cycle.completedAt).toLocaleString()}</p> : null}
      </section>
    </div>
  );
}

export interface PastReviewDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycleId: string | null;
  viewType?: "past" | "active";
  /** When user picks a row in “All past reviews”, parent should update `cycleId` (and usually set view to past). */
  onSelectPastCycleId?: (cycleId: string) => void;
}

export const PastReviewDetailModal = ({
  isOpen,
  onClose,
  cycleId,
  viewType = "past",
  onSelectPastCycleId,
}: PastReviewDetailModalProps) => {
  const [employeePastListOpen, setEmployeePastListOpen] = useState(false);
  const { loading, snapshot, reviewSettings } = usePastReviewDetailData(isOpen, cycleId);
  const { dialogRef, handleDialogClose } = usePastReviewDetailDialogLayer({
    isOpen,
    employeePastListOpen,
    onClose,
  });

  useEffect(() => {
    if (!isOpen) setEmployeePastListOpen(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <PastReviewDetailDialog
      dialogRef={dialogRef}
      handleDialogClose={handleDialogClose}
      loading={loading}
      snapshot={snapshot}
      reviewSettings={reviewSettings}
      viewType={viewType}
      employeePastListOpen={employeePastListOpen}
      setEmployeePastListOpen={setEmployeePastListOpen}
      onSelectPastCycleId={onSelectPastCycleId}
    />
  );
};
