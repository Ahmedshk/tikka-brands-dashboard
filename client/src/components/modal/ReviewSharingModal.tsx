import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { reviewService } from "../../services/review.service";
import { Spinner } from "../common/Spinner";
import { ReviewEmployeeBioSection } from "../review/ReviewEmployeeBioSection";
import { ManagerReviewResponsesWithHistory } from "../review/ManagerReviewResponsesWithHistory";
import {
  personLabelFromReviewRef,
  personRoleFromReviewRef,
  reviewEmployeeHeaderSubtitle,
} from "../../utils/employeeBioHelpers";
import { ReviewQuestionResponseList } from "../../utils/reviewQuestionResponseList";
import {
  formatMeritIncreaseDisplay,
  type ActionPlanItem,
  type ManagerReview,
  type ReviewCycle,
  type ReviewCycleStatus,
  type ReviewSettings,
  type SelfReview,
} from "../../types/review.types";

interface ReviewSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycle: ReviewCycle;
  onCompleted?: () => void;
}

const PERIODS = ["30", "60", "90"] as const;

export const ReviewSharingModal = ({ isOpen, onClose, cycle, onCompleted }: ReviewSharingModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selfReview, setSelfReview] = useState<SelfReview | null>(null);
  const [managerReview, setManagerReview] = useState<ManagerReview | null>(null);
  const [actionItems, setActionItems] = useState<ActionPlanItem[]>([
    { period: "30", description: "", targetScore: "", currentScore: "" },
    { period: "60", description: "", targetScore: "", currentScore: "" },
    { period: "90", description: "", targetScore: "", currentScore: "" },
  ]);
  const [step, setStep] = useState<"review" | "action-plan">("review");
  /** Full cycle with populated employee (phone, homebase, etc.) for bio. */
  const [cycleDetail, setCycleDetail] = useState<ReviewCycle | null>(null);
  const [reviewSettings, setReviewSettings] = useState<ReviewSettings | null>(null);

  const canAct = (["approved", "sharing_due", "sharing_pending", "sharing_past_due"] as ReviewCycleStatus[]).includes(cycle.status);
  const cycleForBio = cycleDetail ?? cycle;
  const sharingHeaderSubtitle = reviewEmployeeHeaderSubtitle(cycleForBio);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setCycleDetail(null);
      setReviewSettings(null);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const [selfRev, mgrRev, existing, fullCycle, settings] = await Promise.all([
          reviewService.getSelfReview(cycle._id).catch(() => null),
          reviewService.getManagerReview(cycle._id).catch(() => null),
          reviewService.getActionPlan(cycle._id).catch(() => null),
          reviewService.getCycleById(cycle._id).catch(() => null),
          reviewService.getSettings().catch(() => null),
        ]);
        setSelfReview(selfRev);
        setManagerReview(mgrRev);
        setCycleDetail(fullCycle);
        setReviewSettings(settings);
        if (existing?.items.length) setActionItems(existing.items);
      } catch { toast.error("Failed to load review data"); }
      finally { setLoading(false); }
    })();
  }, [isOpen, cycle._id]);

  const handleAddItem = (period: "30" | "60" | "90") => {
    setActionItems([...actionItems, { period, description: "", targetScore: "", currentScore: "" }]);
  };

  const handleRemoveItem = (idx: number) => {
    setActionItems(actionItems.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: keyof ActionPlanItem, value: string) => {
    const updated = [...actionItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setActionItems(updated);
  };

  const handleSaveAndComplete = async () => {
    const validItems = actionItems.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      toast.error("At least one action plan item is required");
      return;
    }
    setSubmitting(true);
    try {
      await reviewService.createActionPlan(cycle._id, validItems);
      await reviewService.completeReview(cycle._id);
      toast.success("Review completed with action plan!");
      onCompleted?.();
      onClose();
    } catch { toast.error("Failed to complete review"); }
    finally { setSubmitting(false); }
  };

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  const modalTitle = step === "review" ? "Review Summary" : "Action Plan";

  let mainContent: ReactNode;
  if (loading) {
    mainContent = (
      <div className="flex justify-center py-12">
        <Spinner size="lg" className="text-button-primary" />
      </div>
    );
  } else if (step === "review") {
    const managerRole = personRoleFromReviewRef(cycleForBio.reviewedByManagerId);
    const mgrQuestionnaire = reviewSettings?.managerReviewQuestionnaire;
    let managerReviewBody: ReactNode;
    if (!managerReview) {
      managerReviewBody = <p className="text-sm text-gray-400 italic">Not available</p>;
    } else {
      managerReviewBody = (
        <ManagerReviewResponsesWithHistory
          managerReview={managerReview}
          questionnaire={mgrQuestionnaire}
          accent="green"
        />
      );
    }

    mainContent = (
      <div className="space-y-6 pb-2">
        <ReviewEmployeeBioSection cycle={cycleForBio} sectionHeadingId="sharing-employee-bio-heading" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-blue-50/50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-700 mb-3 uppercase tracking-wide">Self-Review</h3>
            {selfReview ? (
              <ReviewQuestionResponseList
                responses={selfReview.responses ?? []}
                questionnaire={reviewSettings?.selfReviewQuestionnaire}
              />
            ) : (
              <p className="text-sm text-gray-400 italic">Not available</p>
            )}
          </section>
          <section className="bg-green-50/50 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-green-700 mb-2 uppercase tracking-wide">Manager Review</h3>
            <p className="text-xs text-gray-600 mb-3">
              <span className="text-secondary">Reviewed by: </span>
              <span className="font-semibold text-gray-900">
                {personLabelFromReviewRef(cycleForBio.reviewedByManagerId)}
              </span>
              {managerRole ? (
                <span className="text-gray-500"> · {managerRole}</span>
              ) : null}
            </p>
            {managerReviewBody}
          </section>
        </div>
      </div>
    );
  } else {
    mainContent = (
      <div className="space-y-6 pb-2">
        <ReviewEmployeeBioSection cycle={cycleForBio} sectionHeadingId="sharing-employee-bio-action-plan-heading" />
        {PERIODS.map((period) => (
          <section key={period} className="border border-gray-100 rounded-lg p-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <h3 className="text-sm font-semibold text-gray-700">{period}-Day Actions</h3>
              {canAct ? (
                <button
                  type="button"
                  onClick={() => handleAddItem(period)}
                  className="w-full cursor-pointer rounded-lg bg-button-primary px-3 py-2 text-sm text-white transition-opacity hover:opacity-90 sm:w-auto"
                >
                  + Add Item
                </button>
              ) : null}
            </div>
            {actionItems.filter((i) => i.period === period).map((item) => {
              const idx = actionItems.indexOf(item);
              return (
                <div key={idx} className="flex min-w-0 flex-col gap-3">
                  <div className="min-w-0">
                    <label htmlFor={`action-desc-${idx}`} className="mb-1 block text-xs font-medium text-secondary md:hidden">
                      Description
                    </label>
                    <textarea
                      id={`action-desc-${idx}`}
                      value={item.description}
                      onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                      disabled={!canAct}
                      rows={2}
                      placeholder="Action item description"
                      className="w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 disabled:bg-gray-50"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:gap-3">
                    <div className="min-w-0 md:flex-1">
                      <label htmlFor={`action-current-${idx}`} className="mb-1 block text-xs font-medium text-secondary md:hidden">
                        Current
                      </label>
                      <input
                        id={`action-current-${idx}`}
                        type="text"
                        value={item.currentScore ?? ""}
                        onChange={(e) => handleItemChange(idx, "currentScore", e.target.value)}
                        disabled={!canAct}
                        placeholder="Current"
                        className="w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:bg-gray-50"
                      />
                    </div>
                    <div className="min-w-0 md:flex-1">
                      <label htmlFor={`action-target-${idx}`} className="mb-1 block text-xs font-medium text-secondary md:hidden">
                        Target
                      </label>
                      <input
                        id={`action-target-${idx}`}
                        type="text"
                        value={item.targetScore ?? ""}
                        onChange={(e) => handleItemChange(idx, "targetScore", e.target.value)}
                        disabled={!canAct}
                        placeholder="Target"
                        className="w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:bg-gray-50"
                      />
                    </div>
                    {canAct ? (
                      <div className="flex shrink-0 md:items-end md:pb-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-sm text-red-400 hover:text-red-600 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    );
  }

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="review-sharing-modal-title"
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-4xl">
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
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 id="review-sharing-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              {modalTitle}
            </h2>
            {sharingHeaderSubtitle ? (
              <p className="mt-1 text-xs md:text-sm text-white/90">
                <span className="font-medium">{sharingHeaderSubtitle.name}</span>
                {sharingHeaderSubtitle.role ? <span>{` · ${sharingHeaderSubtitle.role}`}</span> : null}
              </p>
            ) : null}
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden border-x border-gray-200">
            {formatMeritIncreaseDisplay(cycle.salaryIncrement, cycle.salaryIncrementType) != null && (
              <div className="px-5 pt-4 flex-shrink-0">
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <span className="text-sm font-medium text-green-700">
                    Merit Increase: {formatMeritIncreaseDisplay(cycle.salaryIncrement, cycle.salaryIncrementType)}
                  </span>
                  {cycle.directorComments ? (
                    <p className="text-xs text-green-600 mt-1">{cycle.directorComments}</p>
                  ) : null}
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-4 md:[scrollbar-gutter:stable]">
              {mainContent}
            </div>

            {loading ? null : (
              <div className="flex-shrink-0 flex flex-col gap-3 px-5 py-4 border-t border-gray-200 bg-card-background sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {step === "action-plan" ? (
                    <button
                      type="button"
                      onClick={() => setStep("review")}
                      className="px-0 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer sm:px-4"
                    >
                      ← Back to Review
                    </button>
                  ) : null}
                </div>
                <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end sm:gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full rounded-lg px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 cursor-pointer sm:w-auto"
                  >
                    Close
                  </button>
                  {canAct && step === "review" ? (
                    <button
                      type="button"
                      onClick={() => setStep("action-plan")}
                      className="w-full rounded-lg bg-button-primary px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 cursor-pointer sm:w-auto"
                    >
                      Create Action Plan →
                    </button>
                  ) : null}
                  {canAct && step === "action-plan" ? (
                    <button
                      type="button"
                      onClick={handleSaveAndComplete}
                      disabled={submitting}
                      className="w-full rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer sm:w-auto"
                    >
                      {submitting ? "Saving..." : "Save Action Plan & Complete Review"}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
