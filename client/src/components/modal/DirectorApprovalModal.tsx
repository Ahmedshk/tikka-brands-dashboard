import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { reviewService } from "../../services/review.service";
import { Spinner } from "../common/Spinner";
import type { SelfReview, ManagerReview, ReviewCycle, ReviewCycleStatus } from "../../types/review.types";

interface DirectorApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycleId: string;
  status: ReviewCycleStatus;
  onDecision?: () => void;
}

function personLabel(
  ref: string | { firstName?: string; lastName?: string; email?: string; role?: string } | undefined | null,
): string {
  if (!ref) return "—";
  if (typeof ref === "object") {
    const n = [ref.firstName, ref.lastName].filter(Boolean).join(" ").trim();
    return n || ref.email || "—";
  }
  return "—";
}

function personRole(
  ref: string | { role?: string } | undefined | null,
): string | null {
  if (!ref || typeof ref === "string") return null;
  return ref.role?.trim() || null;
}

export const DirectorApprovalModal = ({ isOpen, onClose, cycleId, status, onDecision }: DirectorApprovalModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selfReview, setSelfReview] = useState<SelfReview | null>(null);
  const [managerReview, setManagerReview] = useState<ManagerReview | null>(null);
  const [cycle, setCycle] = useState<ReviewCycle | null>(null);
  const [comments, setComments] = useState("");
  const [salaryIncrement, setSalaryIncrement] = useState("");
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);

  const canDecide = ["manager_review_submitted", "director_approval_pending", "director_approval_past_due"].includes(status);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      try {
        const [selfRev, mgrRev, cycleData] = await Promise.all([
          reviewService.getSelfReview(cycleId).catch(() => null),
          reviewService.getManagerReview(cycleId).catch(() => null),
          reviewService.getCycleById(cycleId).catch(() => null),
        ]);
        setSelfReview(selfRev);
        setManagerReview(mgrRev);
        setCycle(cycleData);
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
        });
        toast.success("Review approved!");
      } else {
        await reviewService.rejectReview(cycleId, { comments });
        toast.success("Review rejected");
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

  const renderResponses = (responses: { questionId: string; questionText: string; answer: string }[]) => (
    <div className="space-y-3">
      {responses.map((r) => (
        <div key={r.questionId} className="text-sm">
          <span className="font-medium text-gray-700">{r.questionText}</span>
          <p className="text-gray-800 mt-0.5">{r.answer}</p>
        </div>
      ))}
    </div>
  );

  return createPortal(
    <dialog ref={dialogRef} onClose={onClose} className="backdrop:bg-black/50 rounded-2xl shadow-xl w-full max-w-4xl p-0 m-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">Director Review & Approval</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl cursor-pointer">✕</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-button-primary" /></div>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto pr-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Self Review */}
              <section className="bg-blue-50/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-700 mb-3 uppercase tracking-wide">Employee Self-Review</h3>
                {selfReview ? renderResponses(selfReview.responses) : (
                  <p className="text-sm text-gray-400 italic">No self-review submitted</p>
                )}
              </section>

              {/* Manager Review: original (before viewing self-review) and updated (after viewing) */}
              <section className="bg-green-50/50 rounded-lg p-4 space-y-4">
                <h3 className="text-sm font-semibold text-green-700 mb-2 uppercase tracking-wide">Manager Review</h3>
                <p className="text-xs text-gray-600 mb-3">
                  <span className="text-gray-500">Reviewed by </span>
                  <span className="font-semibold text-gray-900">{personLabel(cycle?.reviewedByManagerId)}</span>
                  {personRole(cycle?.reviewedByManagerId) ? (
                    <span className="text-gray-500"> · {personRole(cycle?.reviewedByManagerId)}</span>
                  ) : null}
                </p>
                {managerReview ? (
                  <>
                    {managerReview.revisionHistory && managerReview.revisionHistory.length >= 2 ? (
                      <>
                        <div>
                          <h4 className="text-xs font-semibold text-green-800 mb-2">Original (before viewing employee self-review)</h4>
                          {renderResponses(managerReview.revisionHistory[0]?.responses ?? [])}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-green-800 mb-2">Updated (after viewing employee self-review)</h4>
                          {renderResponses(
                            managerReview.revisionHistory.at(-1)?.responses ?? [],
                          )}
                        </div>
                      </>
                    ) : (
                      <div>
                        {renderResponses(managerReview.responses)}
                      </div>
                    )}
                  </>
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
                    className={`px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors border ${
                      decision === "approve" ? "bg-green-600 text-white border-green-600" : "bg-white border-gray-200 text-gray-700 hover:border-green-400"
                    }`}>
                    Approve
                  </button>
                  <button type="button" onClick={() => setDecision("reject")}
                    className={`px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors border ${
                      decision === "reject" ? "bg-red-600 text-white border-red-600" : "bg-white border-gray-200 text-gray-700 hover:border-red-400"
                    }`}>
                    Reject
                  </button>
                </div>

                {decision === "approve" && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <label
                      htmlFor="salary-increment"
                      className="text-sm font-medium text-gray-600 shrink-0 sm:min-w-[12rem]"
                    >
                      Salary Increment % (optional)
                    </label>
                    <input
                      id="salary-increment"
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      min="0"
                      max="100"
                      value={salaryIncrement}
                      onChange={(e) => setSalaryIncrement(sanitizeSalaryIncrementInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-") {
                          e.preventDefault();
                        }
                      }}
                      className="w-full sm:w-48 max-w-xs border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20"
                      placeholder="e.g. 5.0"
                    />
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

        {!loading && (
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">Close</button>
            {canDecide && decision && (
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className={`px-6 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer ${
                  decision === "approve" ? "bg-green-600" : "bg-red-600"
                }`}>
                {submitting && "Submitting..."}
                {!submitting && decision === "approve" && "Approve Review"}
                {!submitting && decision === "reject" && "Reject Review"}
              </button>
            )}
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
};
