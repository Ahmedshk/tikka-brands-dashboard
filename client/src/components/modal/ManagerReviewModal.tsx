import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";
import { getErrorMessage } from "../../services/api.service";
import { reviewService } from "../../services/review.service";
import { Spinner } from "../common/Spinner";
import { ReviewEmployeeBioSection } from "../review/ReviewEmployeeBioSection";
import { ReviewQuestionAttachmentLinks } from "../ReviewSettings/ReviewQuestionAttachmentLinks";
import { reviewEmployeeHeaderSubtitle } from "../../utils/employeeBioHelpers";
import type {
  Question,
  QuestionResponse,
  ReviewCycle,
  ReviewCycleStatus,
  SelfReview,
  ManagerReview,
} from "../../types/review.types";

interface ManagerReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycleId: string;
  status: ReviewCycleStatus;
  onSubmitted?: () => void;
}

export const ManagerReviewModal = ({ isOpen, onClose, cycleId, status, onSubmitted }: ManagerReviewModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  /** Self-review questionnaire (for attachments when showing employee self-review). */
  const [selfReviewQuestionnaire, setSelfReviewQuestionnaire] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingReview, setExistingReview] = useState<ManagerReview | null>(null);
  const [selfReview, setSelfReview] = useState<SelfReview | null>(null);
  const [showSelfReview, setShowSelfReview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loadingSelfReview, setLoadingSelfReview] = useState(false);
  const [reviewCycle, setReviewCycle] = useState<ReviewCycle | null>(null);

  const hasCompleted = !!existingReview;
  const canSeeEmployeeReview = hasCompleted;
  const submittedToDirector = [
    "manager_review_submitted", "director_approval_due", "director_approval_pending", "director_approval_past_due",
    "approved", "rejected", "sharing_due", "sharing_pending", "sharing_past_due", "completed",
    "checkin_30_due", "checkin_30_past_due", "checkin_30_complete", "checkin_30_done", "checkin_60_due", "checkin_60_past_due", "checkin_60_complete", "checkin_60_done", "cycle_complete",
  ].includes(status);
  const canDoReview = ["self_review_submitted", "manager_review_due", "manager_review_pending", "manager_review_past_due"].includes(status);

  const handleViewEmployeeSelfReview = async () => {
    if (!hasCompleted || selfReview) {
      setShowSelfReview(true);
      return;
    }
    setLoadingSelfReview(true);
    try {
      const data = await reviewService.getSelfReview(cycleId);
      setSelfReview(data ?? null);
      setShowSelfReview(true);
    } catch {
      toast.error("Complete your review first to view the self-review");
    } finally {
      setLoadingSelfReview(false);
    }
  };

  const showCompleteReview = !hasCompleted && canDoReview;
  const showUpdateReview = hasCompleted && !submittedToDirector && !editing;
  const showSubmitReview = canDoReview && !submittedToDirector;
  const hasMissingRequired = questions.some((q) => q.required && !(answers[q.id]?.trim()));
  const isSubmitDisabled = !hasCompleted || hasMissingRequired;
  /** After complete, form is read-only until "Update Review" (editing). Do not lock per-question from revisionHistory[0] — that snapshot contains every question and made all fields stay disabled. */
  const isFormLocked = hasCompleted && !editing;

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setSelfReview(null);
    setShowSelfReview(false);
    setReviewCycle(null);
    (async () => {
      setLoading(true);
      try {
        const [settings, existing, cycleData] = await Promise.all([
          reviewService.getSettings(),
          reviewService.getManagerReview(cycleId).catch(() => null),
          reviewService.getCycleById(cycleId).catch(() => null),
        ]);
        setReviewCycle(cycleData);
        setQuestions(settings?.managerReviewQuestionnaire ?? []);
        setSelfReviewQuestionnaire(settings?.selfReviewQuestionnaire ?? []);
        if (existing) {
          setExistingReview(existing);
          const map: Record<string, string> = {};
          for (const r of existing.responses) map[r.questionId] = r.answer;
          setAnswers(map);
        } else {
          setExistingReview(null);
          setAnswers({});
        }
      } catch { toast.error("Failed to load review data"); }
      finally { setLoading(false); }
    })();
  }, [isOpen, cycleId]);

  const buildResponses = (): QuestionResponse[] =>
    questions.map((q) => ({
      questionId: q.id,
      questionText: q.text,
      answer: answers[q.id] ?? "",
    }));

  const handleCompleteReview = async () => {
    const missing = questions.filter((q) => q.required && !answers[q.id]?.trim());
    if (missing.length > 0) {
      toast.error(`Please answer all required questions (${missing.length} remaining)`);
      return;
    }
    setSubmitting(true);
    try {
      const responses: QuestionResponse[] = questions.map((q) => ({
        questionId: q.id,
        questionText: q.text,
        answer: answers[q.id] ?? "",
      }));
      const result = await reviewService.completeManagerReview(cycleId, responses);
      setExistingReview(result);
      toast.success("Review saved. You can now view the employee's self-review.");
      onSubmitted?.();
    } catch { toast.error("Failed to save review"); }
    finally { setSubmitting(false); }
  };

  const handleSubmitToDirector = async () => {
    if (hasMissingRequired) {
      toast.error("Please answer all required questions before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const responses = buildResponses();
      await reviewService.submitManagerReview(cycleId, responses);
      toast.success("Review submitted to director!");
      setEditing(false);
      onSubmitted?.();
      onClose();
    } catch (e: unknown) {
      toast.error(isAxiosError(e) ? getErrorMessage(e) : "Failed to submit review");
    }
    finally { setSubmitting(false); }
  };

  const renderQuestionField = (q: Question, value: string, onChange: (v: string) => void, disabled: boolean) => {
    switch (q.type) {
      case "text":
        return (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 disabled:bg-gray-50" />
        );
      case "rating":
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" disabled={disabled} onClick={() => onChange(String(v))}
                className={`w-10 h-10 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                  value === String(v) ? "bg-button-primary text-white border-button-primary" : "bg-white border-gray-200 hover:border-gray-400"
                } disabled:opacity-60`}>
                {v}
              </button>
            ))}
          </div>
        );
      case "multiple_choice":
        return (
          <div className="space-y-1">
            {(q.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <input type="radio" name={`mgr-${q.id}`} value={opt} checked={value === opt}
                  onChange={() => onChange(opt)} disabled={disabled} />
                {opt}
              </label>
            ))}
          </div>
        );
      case "yes_no":
        return (
          <div className="flex gap-3">
            {["Yes", "No"].map((v) => (
              <button key={v} type="button" disabled={disabled} onClick={() => onChange(v)}
                className={`px-4 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                  value === v ? "bg-button-primary text-white border-button-primary" : "bg-white border-gray-200 hover:border-gray-400"
                } disabled:opacity-60`}>
                {v}
              </button>
            ))}
          </div>
        );
    }
  };

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  const managerHeaderSubtitle = reviewEmployeeHeaderSubtitle(reviewCycle);

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="manager-review-modal-title"
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
            <h2 id="manager-review-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Manager Review
            </h2>
            {managerHeaderSubtitle ? (
              <p className="mt-1 text-xs md:text-sm text-white/90">
                <span className="font-medium">{managerHeaderSubtitle.name}</span>
                {managerHeaderSubtitle.role ? <span>{` · ${managerHeaderSubtitle.role}`}</span> : null}
              </p>
            ) : null}
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden border-x border-gray-200">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-4 md:[scrollbar-gutter:stable]">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-button-primary" /></div>
        ) : (
          <div className="space-y-6 pb-2">
            <ReviewEmployeeBioSection cycle={reviewCycle} sectionHeadingId="manager-review-employee-bio-heading" />

            {/* Manager's own review */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Your Review</h3>
              <div className="space-y-4">
                {questions.toSorted((a, b) => a.order - b.order).map((q) => (
                  <div key={q.id} className="space-y-1">
                    <label className="text-sm font-medium text-primary">
                      {q.text} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    <ReviewQuestionAttachmentLinks attachments={q.attachments} />
                    {renderQuestionField(q, answers[q.id] ?? "", (v) => setAnswers({ ...answers, [q.id]: v }), isFormLocked)}
                  </div>
                ))}
              </div>
            </section>

            {/* Revision history */}
            {existingReview && existingReview.revisionHistory.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Revision History</h3>
                <div className="space-y-3">
                  {existingReview.revisionHistory.map((rev, idx) => (
                    <details key={rev.updatedAt} className="border border-gray-100 rounded-lg p-3">
                      <summary className="text-xs font-medium text-gray-500 cursor-pointer">
                        Revision {idx + 1} — {new Date(rev.updatedAt).toLocaleString()}
                      </summary>
                      <div className="mt-2 space-y-2">
                        {rev.responses.map((r) => (
                          <div key={r.questionId} className="text-sm">
                            <span className="font-medium text-black">{r.questionText}:</span>{" "}
                            <span className="text-gray-800">{r.answer}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* View Employee Self-Review: locked until manager has completed */}
            <section>
              <button
                type="button"
                onClick={handleViewEmployeeSelfReview}
                disabled={!hasCompleted}
                className={`text-sm font-semibold flex items-center gap-1 cursor-pointer ${
                  hasCompleted
                    ? "text-button-primary hover:underline"
                    : "text-gray-400 cursor-not-allowed"
                }`}
              >
                {showSelfReview ? "▼" : "►"} View Employee Self-Review
                {!hasCompleted && " (complete your review first)"}
              </button>
              {!hasCompleted && (
                <p className="text-xs text-gray-500 mt-1">Click &quot;Complete Review&quot; to save and unlock.</p>
              )}
              {loadingSelfReview && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <Spinner size="sm" className="text-button-primary" /> Loading…
                </div>
              )}
              {canSeeEmployeeReview && selfReview && showSelfReview && (
                <div className="mt-3 space-y-4 bg-blue-50/50 rounded-lg p-4">
                  {selfReview.responses
                    .toSorted((a, b) => {
                      const qa = selfReviewQuestionnaire.find((q) => q.id === a.questionId);
                      const qb = selfReviewQuestionnaire.find((q) => q.id === b.questionId);
                      return (qa?.order ?? 0) - (qb?.order ?? 0);
                    })
                    .map((r) => {
                      const sq = selfReviewQuestionnaire.find((q) => q.id === r.questionId);
                      return (
                        <div key={r.questionId} className="space-y-1 text-sm">
                          <span className="font-medium text-black block">{r.questionText}</span>
                          <ReviewQuestionAttachmentLinks attachments={sq?.attachments} />
                          <p className="text-gray-800">{r.answer}</p>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>
          </div>
        )}
            </div>

            {loading ? null : (
              <div className="flex-shrink-0 flex flex-wrap justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-card-background">
            <button type="button" onClick={handleClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">
              Close
            </button>
            {showCompleteReview && (
              <button type="button" onClick={handleCompleteReview} disabled={submitting || hasMissingRequired}
                className="px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer">
                {submitting ? "Saving..." : "Complete Review"}
              </button>
            )}
            {showUpdateReview && (
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  toast.success("You can edit your answers below. Submit when ready to send to the director.");
                }}
                className="px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:opacity-90 cursor-pointer"
              >
                Update Review
              </button>
            )}
            {hasCompleted && editing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Cancel edit
              </button>
            )}
            {showSubmitReview && (
              <button type="button" onClick={handleSubmitToDirector} disabled={submitting || isSubmitDisabled}
                className="px-6 py-2 bg-button-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer">
                {submitting ? "Submitting..." : "Submit Review"}
              </button>
            )}
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
