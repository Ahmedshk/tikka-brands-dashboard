import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { reviewService } from "../../services/review.service";
import { Spinner } from "../common/Spinner";
import { ReviewEmployeeBioSection } from "../review/ReviewEmployeeBioSection";
import {
  personLabelFromReviewRef,
  personRoleFromReviewRef,
  reviewEmployeeHeaderSubtitle,
} from "../../utils/employeeBioHelpers";
import { ReviewQuestionResponseList } from "../../utils/reviewQuestionResponseList";
import { ManagerReviewResponsesWithHistory } from "../review/ManagerReviewResponsesWithHistory";
import type {
  ManagerReview,
  ReviewCycle,
  ReviewCycleStatus,
  ReviewSettings,
  SalaryIncrementType,
  SelfReview,
} from "../../types/review.types";

interface DirectorApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycleId: string;
  status: ReviewCycleStatus;
  onDecision?: () => void;
}

export const DirectorApprovalModal = ({ isOpen, onClose, cycleId, status, onDecision }: DirectorApprovalModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selfReview, setSelfReview] = useState<SelfReview | null>(null);
  const [managerReview, setManagerReview] = useState<ManagerReview | null>(null);
  const [cycle, setCycle] = useState<ReviewCycle | null>(null);
  const [reviewSettings, setReviewSettings] = useState<ReviewSettings | null>(null);
  const [comments, setComments] = useState("");
  const [salaryIncrement, setSalaryIncrement] = useState("");
  const [salaryIncrementKind, setSalaryIncrementKind] = useState<SalaryIncrementType>("percent");
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);

  const canDecide = ["manager_review_submitted", "director_approval_due", "director_approval_pending", "director_approval_past_due"].includes(status);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      try {
        const [selfRev, mgrRev, cycleData, settings] = await Promise.all([
          reviewService.getSelfReview(cycleId).catch(() => null),
          reviewService.getManagerReview(cycleId).catch(() => null),
          reviewService.getCycleById(cycleId).catch(() => null),
          reviewService.getSettings().catch(() => null),
        ]);
        setSelfReview(selfRev);
        setManagerReview(mgrRev);
        setCycle(cycleData);
        setReviewSettings(settings);
      } catch { toast.error("Failed to load reviews"); }
      finally { setLoading(false); }
    })();
  }, [isOpen, cycleId]);

  const handleSubmit = async () => {
    if (!decision) { toast.error("Please select approve or reject"); return; }
    if (decision === "reject" && !comments.trim()) { toast.error("Comments required for rejection"); return; }
    setSubmitting(true);
    try {
      if (decision === "approve") {
        await reviewService.approveReview(cycleId, {
          comments: comments || undefined,
          salaryIncrement: salaryIncrement ? Number.parseFloat(salaryIncrement) : undefined,
          salaryIncrementType: salaryIncrement ? salaryIncrementKind : undefined,
        });
        toast.success("Review approved!");
      } else {
        await reviewService.rejectReview(cycleId, { comments });
        toast.success("Returned to manager for revision");
      }
      onDecision?.();
      onClose();
    } catch { toast.error("Failed to submit decision"); }
    finally { setSubmitting(false); }
  };

  /** Salary % field: digits and one decimal only (blocks e/E/+/− from keys and paste). */
  const sanitizeSalaryIncrementInput = (raw: string): string => {
    const digitsAndDot = raw.replaceAll(/[^0-9.]/g, "");
    const firstDot = digitsAndDot.indexOf(".");
    if (firstDot === -1) return digitsAndDot;
    return digitsAndDot.slice(0, firstDot + 1) + digitsAndDot.slice(firstDot + 1).replaceAll(".", "");
  };

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  const headerSubtitle = reviewEmployeeHeaderSubtitle(cycle);

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="director-approval-modal-title"
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
            <h2 id="director-approval-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Director Review & Approval
            </h2>
            {headerSubtitle ? (
              <p className="mt-1 text-xs md:text-sm text-white/90">
                <span className="font-medium">{headerSubtitle.name}</span>
                {headerSubtitle.role ? <span>{` · ${headerSubtitle.role}`}</span> : null}
              </p>
            ) : null}
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden border-x border-gray-200">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-4 md:[scrollbar-gutter:stable]">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Spinner size="lg" className="text-button-primary" />
                </div>
              ) : (
                <div className="space-y-6 pb-2">
                  <ReviewEmployeeBioSection cycle={cycle} sectionHeadingId="director-employee-bio-heading" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Self Review */}
                    <section className="bg-blue-50/50 rounded-lg p-4">
                      <h3 className="text-sm font-semibold text-blue-700 mb-3 uppercase tracking-wide">Employee Self-Review</h3>
                      {selfReview ? (
                        <ReviewQuestionResponseList
                          responses={selfReview.responses ?? []}
                          questionnaire={reviewSettings?.selfReviewQuestionnaire}
                        />
                      ) : (
                        <p className="text-sm text-gray-400 italic">No self-review submitted</p>
                      )}
                    </section>

                    {/* Manager Review: original (before viewing self-review) and updated (after viewing) */}
                    <section className="bg-green-50/50 rounded-lg p-4 space-y-4">
                      <h3 className="text-sm font-semibold text-green-700 mb-2 uppercase tracking-wide">Manager Review</h3>
                      <p className="text-xs text-gray-600 mb-3">
                        <span className="text-secondary">Reviewed by: </span>
                        <span className="font-semibold text-gray-900">
                          {personLabelFromReviewRef(cycle?.reviewedByManagerId)}
                        </span>
                        {personRoleFromReviewRef(cycle?.reviewedByManagerId) ? (
                          <span className="text-gray-500">
                            {" "}
                            · {personRoleFromReviewRef(cycle?.reviewedByManagerId)}
                          </span>
                        ) : null}
                      </p>
                      {managerReview ? (
                        <ManagerReviewResponsesWithHistory
                          managerReview={managerReview}
                          questionnaire={reviewSettings?.managerReviewQuestionnaire}
                          accent="green"
                        />
                      ) : (
                        <p className="text-sm text-gray-400 italic">No manager review submitted</p>
                      )}
                    </section>
                  </div>

                  {canDecide && (
                    <section className="border border-gray-100 rounded-lg p-4 space-y-4">
                      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Decision</h3>

                      <div className="flex gap-3">
                        <button type="button" onClick={() => setDecision("approve")}
                          className={`px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors border ${decision === "approve" ? "bg-green-600 text-white border-green-600" : "bg-white border-gray-200 text-gray-700 hover:border-green-400"
                            }`}>
                          Approve
                        </button>
                        <button type="button" onClick={() => setDecision("reject")}
                          className={`px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors border ${decision === "reject" ? "bg-red-600 text-white border-red-600" : "bg-white border-gray-200 text-gray-700 hover:border-red-400"
                            }`}>
                          Reject
                        </button>
                      </div>

                      {decision === "approve" && (
                        <div className="space-y-3">
                          <div>
                            <span className="text-sm font-medium text-gray-600 block mb-2">
                              Merit increase (optional)
                            </span>
                            <div className="flex flex-wrap gap-4">
                              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input
                                  type="radio"
                                  name="salary-increment-kind"
                                  className="accent-button-primary"
                                  checked={salaryIncrementKind === "percent"}
                                  onChange={() => {
                                    setSalaryIncrementKind("percent");
                                    setSalaryIncrement("");
                                  }}
                                />
                                Percent
                              </label>
                              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input
                                  type="radio"
                                  name="salary-increment-kind"
                                  className="accent-button-primary"
                                  checked={salaryIncrementKind === "fixed"}
                                  onChange={() => {
                                    setSalaryIncrementKind("fixed");
                                    setSalaryIncrement("");
                                  }}
                                />
                                Fixed amount (USD)
                              </label>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                            <label
                              htmlFor="salary-increment"
                              className="text-sm font-medium text-gray-600 shrink-0 sm:min-w-[12rem]"
                            >
                              {salaryIncrementKind === "percent" ? "Increase (%)" : "Increase ($)"}
                            </label>
                            <input
                              id="salary-increment"
                              type="number"
                              inputMode="decimal"
                              step={salaryIncrementKind === "percent" ? 0.5 : 0.01}
                              min={0}
                              max={salaryIncrementKind === "percent" ? 100 : undefined}
                              value={salaryIncrement}
                              onChange={(e) => setSalaryIncrement(sanitizeSalaryIncrementInput(e.target.value))}
                              onKeyDown={(e) => {
                                if (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-") {
                                  e.preventDefault();
                                }
                              }}
                              className="w-full sm:w-48 max-w-xs border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20"
                              placeholder={salaryIncrementKind === "percent" ? "e.g. 5.0" : "e.g. 5000"}
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-600">
                          Comments {decision === "reject" && <span className="text-red-500">*</span>}
                        </label>
                        <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20"
                          placeholder={decision === "reject" ? "Reason for rejection (required)" : "Optional comments"} />
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            {!loading && (
              <div className="flex-shrink-0 flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-card-background">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
                >
                  Close
                </button>
                {canDecide && decision ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className={`px-6 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer ${decision === "approve" ? "bg-green-600" : "bg-red-600"
                      }`}
                  >
                    {submitting ? "Submitting..." : null}
                    {!submitting && decision === "approve" ? "Approve Review" : null}
                    {!submitting && decision === "reject" ? "Reject Review" : null}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
