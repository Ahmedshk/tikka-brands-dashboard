import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { reviewService } from "../../services/review.service";
import { Spinner } from "../common/Spinner";
import type {
  SelfReview, ManagerReview, ReviewCycle, ActionPlanItem, ReviewCycleStatus,
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

  const canAct = (["approved", "sharing_pending", "sharing_past_due"] as ReviewCycleStatus[]).includes(cycle.status);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      try {
        const [selfRev, mgrRev, existing] = await Promise.all([
          reviewService.getSelfReview(cycle._id).catch(() => null),
          reviewService.getManagerReview(cycle._id).catch(() => null),
          reviewService.getActionPlan(cycle._id).catch(() => null),
        ]);
        setSelfReview(selfRev);
        setManagerReview(mgrRev);
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

  const renderResponses = (responses: { questionId: string; questionText: string; answer: string }[]) => (
    <div className="space-y-2">
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
          <h2 className="text-lg font-semibold text-primary">
            {step === "review" ? "Review Summary" : "Action Plan"}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl cursor-pointer">✕</button>
        </div>

        {cycle.salaryIncrement != null && cycle.salaryIncrement > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-4">
            <span className="text-sm font-medium text-green-700">
              Merit Increase: {cycle.salaryIncrement}%
            </span>
            {cycle.directorComments && (
              <p className="text-xs text-green-600 mt-1">{cycle.directorComments}</p>
            )}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-button-primary" /></div>
        )}
        {!loading && step === "review" && (
          <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-blue-50/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-700 mb-3 uppercase tracking-wide">Self-Review</h3>
                {selfReview ? renderResponses(selfReview.responses) : <p className="text-sm text-gray-400 italic">Not available</p>}
              </section>
              <section className="bg-green-50/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-700 mb-3 uppercase tracking-wide">Manager Review</h3>
                {managerReview ? renderResponses(managerReview.responses) : <p className="text-sm text-gray-400 italic">Not available</p>}
              </section>
            </div>
          </div>
        )}
        {!loading && step === "action-plan" && (
          <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-6">
            {PERIODS.map((period) => (
              <section key={period} className="border border-gray-100 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">{period}-Day Actions</h3>
                  {canAct && (
                    <button type="button" onClick={() => handleAddItem(period)}
                      className="text-xs text-button-primary hover:underline cursor-pointer">
                      + Add Item
                    </button>
                  )}
                </div>
                {actionItems.filter((i) => i.period === period).map((item) => {
                  const idx = actionItems.indexOf(item);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                      <textarea
                        value={item.description}
                        onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                        disabled={!canAct}
                        rows={2}
                        placeholder="Action item description"
                        className="col-span-6 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 disabled:bg-gray-50"
                      />
                      <input
                        type="text"
                        value={item.currentScore ?? ""}
                        onChange={(e) => handleItemChange(idx, "currentScore", e.target.value)}
                        disabled={!canAct}
                        placeholder="Current"
                        className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:bg-gray-50"
                      />
                      <input
                        type="text"
                        value={item.targetScore ?? ""}
                        onChange={(e) => handleItemChange(idx, "targetScore", e.target.value)}
                        disabled={!canAct}
                        placeholder="Target"
                        className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none disabled:bg-gray-50"
                      />
                      {canAct && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="col-span-2 text-red-400 hover:text-red-600 text-sm cursor-pointer pt-2"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}

        {!loading && (
          <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
            <div>
              {step === "action-plan" && (
                <button type="button" onClick={() => setStep("review")} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">
                  ← Back to Review
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">Close</button>
              {canAct && step === "review" && (
                <button type="button" onClick={() => setStep("action-plan")}
                  className="px-6 py-2 bg-button-primary text-white rounded-lg text-sm font-medium hover:opacity-90 cursor-pointer">
                  Create Action Plan →
                </button>
              )}
              {canAct && step === "action-plan" && (
                <button type="button" onClick={handleSaveAndComplete} disabled={submitting}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer">
                  {submitting ? "Saving..." : "Save Action Plan & Complete Review"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </dialog>,
    document.body,
  );
};
