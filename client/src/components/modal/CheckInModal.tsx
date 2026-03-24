import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import UploadIcon from "@assets/icons/upload.svg?react";
import ViewIcon from "@assets/icons/view.svg?react";
import { reviewService } from "../../services/review.service";
import { Spinner } from "../common/Spinner";
import type { Question, QuestionResponse, ActionPlan, ReviewCycleStatus, CheckIn } from "../../types/review.types";
import { DocumentTypeThumbnail } from "./DocumentTypeThumbnail";
import { ReviewQuestionAttachmentLinks } from "../ReviewSettings/ReviewQuestionAttachmentLinks";
import { TRAINING_DOCUMENT_ACCEPT, getDocumentFormatFromFile, openFileInNewTab } from "../../utils/createTrainingModalHelpers";

interface CheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycleId: string;
  period: "30" | "60";
  status: ReviewCycleStatus;
  onSubmitted?: () => void;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function FilePreviewThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <div className="w-12 h-12 rounded bg-gray-200 animate-pulse" />;
  return <img src={url} alt="" className="w-12 h-12 rounded object-cover border border-gray-200 flex-shrink-0" />;
}

export const CheckInModal = ({ isOpen, onClose, cycleId, period, status, onSubmitted }: CheckInModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [managerComments, setManagerComments] = useState("");
  const [actionPlanProgress, setActionPlanProgress] = useState("");
  const [actionPlan, setActionPlan] = useState<ActionPlan | null>(null);
  const [documentFiles, setDocumentFiles] = useState<{ id: string; file: File }[]>([]);
  const [prior30CheckIn, setPrior30CheckIn] = useState<CheckIn | null>(null);
  const [actionItemValues, setActionItemValues] = useState<Record<number, string>>({});

  const canSubmit = [
    "checkin_30_due", "checkin_30_past_due", "checkin_60_due", "checkin_60_past_due",
  ].includes(status);

  const addDocumentFiles = (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const newEntries = Array.from(fileList).map((file) => ({ id: newId("checkin-doc"), file }));
    setDocumentFiles((prev) => [...prev, ...newEntries]);
  };

  const removeDocumentFile = (fileId: string) => {
    setDocumentFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      setLoading(true);
      setDocumentFiles([]);
      try {
        const [settings, plan, snapshot] = await Promise.all([
          reviewService.getSettings(),
          reviewService.getActionPlan(cycleId).catch(() => null),
          reviewService.getCycleSnapshot(cycleId).catch(() => null),
        ]);
        setQuestions(settings?.checkInQuestionnaire ?? []);
        setActionPlan(plan);
        const checkIn30 = snapshot?.checkIns?.find((ci) => ci.period === "30") ?? null;
        setPrior30CheckIn(checkIn30);
      } catch { toast.error("Failed to load check-in data"); }
      finally { setLoading(false); }
    })();
  }, [isOpen, cycleId]);

  useEffect(() => {
    if (!actionPlan) return;
    const filtered = actionPlan.items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.period === period);
    const existing = period === "30" ? prior30CheckIn : null;
    const nextValues = Object.fromEntries(
      filtered.map(({ idx }) => {
        const existingValue =
          existing?.actionItemProgress?.find((p) => p.actionPlanItemIndex === idx)?.value ?? "";
        return [idx, existingValue];
      }),
    ) as Record<number, string>;
    setActionItemValues(nextValues);
  }, [actionPlan, period, prior30CheckIn]);

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
      await reviewService.submitCheckIn(cycleId, period, {
        responses,
        managerComments: managerComments || undefined,
        actionPlanProgress: actionPlanProgress || undefined,
        actionItemProgress: Object.entries(actionItemValues).map(([actionPlanItemIndex, value]) => ({
          actionPlanItemIndex: Number(actionPlanItemIndex),
          value: value.trim() || undefined,
        })),
      });

      if (documentFiles.length > 0) {
        await reviewService.uploadCheckInDocument(cycleId, period, documentFiles.map((d) => d.file));
      }

      toast.success(`${period}-day check-in submitted!`);
      onSubmitted?.();
      onClose();
    } catch { toast.error("Failed to submit check-in"); }
    finally { setSubmitting(false); }
  };

  /** Only items for this check-in window (30d modal -> 30d items only; 60d -> 60d only). */
  const periodItems = (actionPlan?.items ?? [])
    .map((item, idx) => ({ ...item, _planIndex: idx }))
    .filter((i) => i.period === period);

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  if (!isOpen) return null;

  const checkInTitleId = "check-in-modal-title";

  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby={checkInTitleId}
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
            <h2 id={checkInTitleId} className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              {period}-Day Check-in
            </h2>
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden border-x border-gray-200">
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-4 md:[scrollbar-gutter:stable]">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" className="text-button-primary" /></div>
        ) : (
          <div className="space-y-6 pb-2">
            {/* Action Plan Items */}
            {periodItems.length > 0 && (
              <section className="bg-amber-50/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-amber-700 mb-3 uppercase tracking-wide">Action Plan Items</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-amber-800 border-b border-amber-200">
                        <th className="py-2 pr-3">Description</th>
                        <th className="py-2 pr-3">Current</th>
                        <th className="py-2">Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodItems.map((item, idx) => (
                        <tr
                          key={`${item.period}-${item.description.slice(0, 20)}-${idx}`}
                          className={idx % 2 === 1 ? "bg-amber-50/60" : ""}
                        >
                          <td className="py-2 pr-3 text-gray-800">{item.description}</td>
                          <td className="py-2 pr-3 text-gray-700">{item.currentScore ?? "N/A"}</td>
                          <td className="py-2 text-gray-700">{item.targetScore ?? "N/A"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {periodItems.length > 0 && (
              <section className="rounded-lg p-4 border border-gray-200 bg-white">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                  Progress after {period} days
                </h3>
                <div className="space-y-3">
                  {periodItems.map((item) => (
                    <div key={`progress-input-${item._planIndex}`} className="space-y-1">
                      <label className="text-xs font-medium text-gray-700">{item.description}</label>
                      <input
                        type="text"
                        value={actionItemValues[item._planIndex] ?? ""}
                        onChange={(e) =>
                          setActionItemValues({ ...actionItemValues, [item._planIndex]: e.target.value })
                        }
                        disabled={!canSubmit}
                        placeholder={`Enter value after ${period} days`}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 disabled:bg-gray-50"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {period === "60" && prior30CheckIn?.actionItemProgress?.length ? (
              <section className="bg-blue-50/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-700 mb-3 uppercase tracking-wide">30-Day Progress (From Previous Check-in)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-blue-800 border-b border-blue-200">
                        <th className="py-2 pr-3">Description</th>
                        <th className="py-2 pr-3">Current</th>
                        <th className="py-2 pr-3">After 30 days</th>
                        <th className="py-2">Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prior30CheckIn.actionItemProgress.map((p, idx) => {
                        const actionItem = actionPlan?.items?.[p.actionPlanItemIndex];
                        if (!actionItem) return null;
                        return (
                          <tr key={`${p.actionPlanItemIndex}-${idx}`} className={idx % 2 === 1 ? "bg-blue-50/60" : ""}>
                            <td className="py-2 pr-3 text-gray-800">{actionItem.description}</td>
                            <td className="py-2 pr-3 text-gray-700">{actionItem.currentScore ?? "N/A"}</td>
                            <td className="py-2 pr-3 text-gray-700">{p.value?.trim() || "N/A"}</td>
                            <td className="py-2 text-gray-700">{actionItem.targetScore ?? "N/A"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {/* Questionnaire */}
            <section>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Check-in Questions</h3>
              <div className="space-y-4">
                {questions.toSorted((a, b) => a.order - b.order).map((q) => (
                  <div key={q.id} className="space-y-1">
                    <label className="text-sm font-medium text-primary">
                      {q.text} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    <ReviewQuestionAttachmentLinks attachments={q.attachments} />
                    {q.type === "text" && (
                      <textarea value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                        disabled={!canSubmit} rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 disabled:bg-gray-50" />
                    )}
                    {q.type === "rating" && (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((v) => (
                          <button key={v} type="button" disabled={!canSubmit}
                            onClick={() => setAnswers({ ...answers, [q.id]: String(v) })}
                            className={`w-10 h-10 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                              answers[q.id] === String(v) ? "bg-button-primary text-white border-button-primary" : "bg-white border-gray-200 hover:border-gray-400"
                            } disabled:opacity-60`}>
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                    {q.type === "multiple_choice" && (
                      <div className="space-y-1">
                        {(q.options ?? []).map((opt) => (
                          <label key={opt} className="flex items-center gap-2 text-sm">
                            <input type="radio" name={`ci-${q.id}`} value={opt} checked={answers[q.id] === opt}
                              onChange={() => setAnswers({ ...answers, [q.id]: opt })} disabled={!canSubmit} />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}
                    {q.type === "yes_no" && (
                      <div className="flex gap-3">
                        {["Yes", "No"].map((v) => (
                          <button key={v} type="button" disabled={!canSubmit}
                            onClick={() => setAnswers({ ...answers, [q.id]: v })}
                            className={`px-4 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                              answers[q.id] === v ? "bg-button-primary text-white border-button-primary" : "bg-white border-gray-200 hover:border-gray-400"
                            } disabled:opacity-60`}>
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Manager comments and progress */}
            <section className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="ci-progress" className="text-sm font-medium text-gray-700">Action Plan Progress</label>
                <textarea id="ci-progress" value={actionPlanProgress} onChange={(e) => setActionPlanProgress(e.target.value)}
                  disabled={!canSubmit} rows={3} placeholder="How much of the action plan has been achieved?"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 disabled:bg-gray-50" />
              </div>
              <div className="space-y-1">
                <label htmlFor="ci-comments" className="text-sm font-medium text-gray-700">Manager Comments</label>
                <textarea id="ci-comments" value={managerComments} onChange={(e) => setManagerComments(e.target.value)}
                  disabled={!canSubmit} rows={3} placeholder="Additional comments on employee progress"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 disabled:bg-gray-50" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Upload Documents (optional)</span>
                  <input
                    id="ci-document-input"
                    type="file"
                    accept={TRAINING_DOCUMENT_ACCEPT}
                    multiple
                    onChange={(e) => {
                      addDocumentFiles(e.target.files);
                      e.target.value = "";
                    }}
                    disabled={!canSubmit}
                    className="sr-only"
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById("ci-document-input")?.click()}
                    disabled={!canSubmit}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-primary bg-white hover:bg-gray-50 disabled:opacity-60"
                  >
                    <UploadIcon className="w-4 h-4" />
                    Upload files
                  </button>
                </div>
                {documentFiles.length > 0 ? (
                  <ul className="space-y-2">
                    {documentFiles.map((doc) => (
                      <li key={doc.id} className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 bg-white">
                        {isImageFile(doc.file) ? (
                          <FilePreviewThumbnail file={doc.file} />
                        ) : (
                          <DocumentTypeThumbnail format={getDocumentFormatFromFile(doc.file)} />
                        )}
                        <span className="text-sm text-primary truncate min-w-0 flex-1" title={doc.file.name}>
                          {doc.file.name}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openFileInNewTab(doc.file)}
                            className="p-1.5 text-primary hover:bg-gray-100 rounded"
                            aria-label="View file"
                            title="View file"
                          >
                            <ViewIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDocumentFile(doc.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            aria-label="Remove file"
                          >
                            <span className="text-lg leading-none" aria-hidden>×</span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          </div>
        )}
            </div>

            {loading ? null : (
              <div className="flex-shrink-0 flex flex-wrap justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-card-background">
            <button type="button" onClick={handleClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 cursor-pointer">Close</button>
            {canSubmit && (
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="px-6 py-2 bg-button-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer">
                {submitting ? "Submitting..." : `Submit ${period}-Day Check-in`}
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
