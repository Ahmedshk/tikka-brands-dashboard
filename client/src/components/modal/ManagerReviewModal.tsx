import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { isAxiosError } from "axios";
import { getErrorMessage } from "../../services/api.service";
import { reviewService } from "../../services/review.service";
import { Spinner } from "../common/Spinner";
import { ReviewEmployeeBioSection } from "../review/ReviewEmployeeBioSection";
import { ManagerReviewResponsesWithHistory } from "../review/ManagerReviewResponsesWithHistory";
import { ReviewQuestionAttachmentLinks } from "../ReviewSettings/ReviewQuestionAttachmentLinks";
import { reviewEmployeeHeaderSubtitle } from "../../utils/employeeBioHelpers";
import {
  buildManagerReviewResponses,
  canManagerDoReview,
  isManagerReviewSubmittedToDirector,
  renderManagerReviewQuestionField,
  shouldShowDirectorReturnCallout,
} from "../../utils/managerReviewModalHelpers";
import type {
  Question,
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

function DirectorReturnCallout({
  show,
  directorComments,
}: Readonly<{ show: boolean; directorComments: string | null | undefined }>) {
  if (!show) return null;
  const comments = directorComments?.trim();
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold text-amber-900">Director requested changes</p>
      <p className="mt-1 text-amber-900/90">
        Please update your manager review and submit again for director approval.
      </p>
      {comments ? (
        <div className="mt-2 border-t border-amber-200/80 pt-2">
          <p className="text-xs font-medium text-amber-800 uppercase tracking-wide">Director comments</p>
          <p className="mt-1 whitespace-pre-wrap text-amber-950">{comments}</p>
        </div>
      ) : null}
    </div>
  );
}

function ManagerQuestionsSection({
  questions,
  answers,
  setAnswers,
  isFormLocked,
}: Readonly<{
  questions: Question[];
  answers: Record<string, string>;
  setAnswers: (next: Record<string, string>) => void;
  isFormLocked: boolean;
}>) {
  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Your Review</h3>
      <div className="space-y-4">
        {sortedQuestions.map((q) => (
          <div key={q.id} className="space-y-1">
            <label className="text-sm font-medium text-primary">
              {q.text} {q.required && <span className="text-red-500">*</span>}
            </label>
            <ReviewQuestionAttachmentLinks attachments={q.attachments} />
            {renderManagerReviewQuestionField(
              q,
              answers[q.id] ?? "",
              (v) => setAnswers({ ...answers, [q.id]: v }),
              isFormLocked,
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function EmployeeSelfReviewSection({
  hasCompleted,
  showSelfReview,
  loadingSelfReview,
  canSeeEmployeeReview,
  selfReview,
  selfReviewQuestionnaire,
  handleViewEmployeeSelfReview,
}: Readonly<{
  hasCompleted: boolean;
  showSelfReview: boolean;
  loadingSelfReview: boolean;
  canSeeEmployeeReview: boolean;
  selfReview: SelfReview | null;
  selfReviewQuestionnaire: Question[];
  handleViewEmployeeSelfReview: () => void;
}>) {
  return (
    <section>
      <button
        type="button"
        onClick={handleViewEmployeeSelfReview}
        disabled={!hasCompleted}
        className={`text-sm font-semibold flex items-center gap-1 cursor-pointer ${
          hasCompleted ? "text-button-primary hover:underline" : "text-gray-400 cursor-not-allowed"
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
          {[...selfReview.responses]
            .sort((a, b) => {
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
  );
}

function ManagerReviewFooter({
  loading,
  handleClose,
  showCompleteReview,
  handleCompleteReview,
  showUpdateReview,
  setEditing,
  showSubmitReview,
  handleSubmitToDirector,
  submitting,
  hasMissingRequired,
  isSubmitDisabled,
}: Readonly<{
  loading: boolean;
  handleClose: () => void;
  showCompleteReview: boolean;
  handleCompleteReview: () => void;
  showUpdateReview: boolean;
  setEditing: (v: boolean) => void;
  showSubmitReview: boolean;
  handleSubmitToDirector: () => void;
  submitting: boolean;
  hasMissingRequired: boolean;
  isSubmitDisabled: boolean;
}>) {
  if (loading) return null;
  return (
    <div className="flex-shrink-0 flex flex-wrap justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-card-background">
      <button
        type="button"
        onClick={handleClose}
        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer"
      >
        Close
      </button>
      {showCompleteReview && (
        <button
          type="button"
          onClick={handleCompleteReview}
          disabled={submitting || hasMissingRequired}
          className="px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? "Saving..." : "Complete Review"}
        </button>
      )}
      {showUpdateReview && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="px-6 py-2 bg-gray-200 text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-300 cursor-pointer"
        >
          Update Review
        </button>
      )}
      {showSubmitReview && (
        <button
          type="button"
          onClick={handleSubmitToDirector}
          disabled={submitting || isSubmitDisabled}
          className="px-6 py-2 bg-button-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? "Submitting..." : "Submit to Director"}
        </button>
      )}
    </div>
  );
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
  const submittedToDirector = isManagerReviewSubmittedToDirector(status);
  const canDoReview = canManagerDoReview(status);
  const showDirectorReturnCallout = shouldShowDirectorReturnCallout(reviewCycle, status);

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

  const handleCompleteReview = async () => {
    const missing = questions.filter((q) => q.required && !answers[q.id]?.trim());
    if (missing.length > 0) {
      toast.error(`Please answer all required questions (${missing.length} remaining)`);
      return;
    }
    setSubmitting(true);
    try {
      const responses = buildManagerReviewResponses(questions, answers);
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
      const responses = buildManagerReviewResponses(questions, answers);
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

            <DirectorReturnCallout
              show={showDirectorReturnCallout}
              directorComments={reviewCycle?.directorComments}
            />

            <ManagerQuestionsSection
              questions={questions}
              answers={answers}
              setAnswers={setAnswers}
              isFormLocked={isFormLocked}
            />

            {/* Prior saved snapshots (current answers are in the form above) */}
            {existingReview && existingReview.revisionHistory.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Revision history</h3>
                <ManagerReviewResponsesWithHistory
                  managerReview={existingReview}
                  questionnaire={questions}
                  accent="gray"
                  showCurrentResponses={false}
                />
              </section>
            )}

            <EmployeeSelfReviewSection
              hasCompleted={hasCompleted}
              showSelfReview={showSelfReview}
              loadingSelfReview={loadingSelfReview}
              canSeeEmployeeReview={canSeeEmployeeReview}
              selfReview={selfReview}
              selfReviewQuestionnaire={selfReviewQuestionnaire}
              handleViewEmployeeSelfReview={handleViewEmployeeSelfReview}
            />
          </div>
        )}
            </div>

            <ManagerReviewFooter
              loading={loading}
              handleClose={handleClose}
              showCompleteReview={showCompleteReview}
              handleCompleteReview={handleCompleteReview}
              showUpdateReview={showUpdateReview}
              setEditing={setEditing}
              showSubmitReview={showSubmitReview}
              handleSubmitToDirector={handleSubmitToDirector}
              submitting={submitting}
              hasMissingRequired={hasMissingRequired}
              isSubmitDisabled={isSubmitDisabled}
            />
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
