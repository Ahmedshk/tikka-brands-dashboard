import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { reviewService } from "../../services/review.service";
import { Spinner } from "../common/Spinner";
import type { Question, QuestionResponse, ReviewCycleStatus } from "../../types/review.types";

interface SelfReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycleId: string;
  status: ReviewCycleStatus;
  onSubmitted?: () => void;
}

export const SelfReviewModal = ({ isOpen, onClose, cycleId, status, onSubmitted }: SelfReviewModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingReview, setExistingReview] = useState<QuestionResponse[] | null>(null);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      try {
        const [settings, existing] = await Promise.all([
          reviewService.getSettings(),
          reviewService.getSelfReview(cycleId).catch(() => null),
        ]);
        setQuestions(settings?.selfReviewQuestionnaire ?? []);
        if (existing?.responses) {
          setExistingReview(existing.responses);
          const map: Record<string, string> = {};
          for (const r of existing.responses) map[r.questionId] = r.answer;
          setAnswers(map);
        }
      } catch { toast.error("Failed to load questionnaire"); }
      finally { setLoading(false); }
    })();
  }, [isOpen, cycleId]);

  const handleSubmit = async () => {
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
      await reviewService.submitSelfReview(cycleId, responses);
      toast.success("Self-review submitted!");
      onSubmitted?.();
      onClose();
    } catch { toast.error("Failed to submit self-review"); }
    finally { setSubmitting(false); }
  };

  const readOnly = !!existingReview;
  const canSubmit = ["form_available_85", "self_review_due", "self_review_late", "self_review_past_due"].includes(status);

  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-black/50 rounded-2xl shadow-xl w-full max-w-2xl p-0 m-auto"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">Self-Review</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl cursor-pointer">✕</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-button-primary" /></div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {questions.toSorted((a, b) => a.order - b.order).map((q) => (
              <div key={q.id} className="space-y-1">
                <label className="text-sm font-medium text-primary">
                  {q.text} {q.required && <span className="text-red-500">*</span>}
                </label>
                {q.type === "text" && (
                  <textarea
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    disabled={readOnly}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 disabled:bg-gray-50"
                  />
                )}
                {q.type === "rating" && (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        disabled={readOnly}
                        onClick={() => setAnswers({ ...answers, [q.id]: String(v) })}
                        className={`w-10 h-10 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                          answers[q.id] === String(v)
                            ? "bg-button-primary text-white border-button-primary"
                            : "bg-white border-gray-200 hover:border-gray-400"
                        } disabled:opacity-60`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === "multiple_choice" && (
                  <div className="space-y-1">
                    {(q.options ?? []).map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={q.id}
                          value={opt}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswers({ ...answers, [q.id]: opt })}
                          disabled={readOnly}
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}
                {q.type === "yes_no" && (
                  <div className="flex gap-3">
                    {["Yes", "No"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        disabled={readOnly}
                        onClick={() => setAnswers({ ...answers, [q.id]: v })}
                        className={`px-4 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                          answers[q.id] === v
                            ? "bg-button-primary text-white border-button-primary"
                            : "bg-white border-gray-200 hover:border-gray-400"
                        } disabled:opacity-60`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && canSubmit && !readOnly && (
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">Cancel</button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-button-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Submitting..." : "Submit Self-Review"}
            </button>
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
};
