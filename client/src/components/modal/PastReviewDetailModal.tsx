import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import ViewIcon from "@assets/icons/view.svg?react";
import { reviewService } from "../../services/review.service";
import { getDocumentProxyUrl, openDocumentProxyInNewTab } from "../../services/training.service";
import { Spinner } from "../common/Spinner";
import { DocumentTypeThumbnail } from "./DocumentTypeThumbnail";
import { getDocumentFormatFromApiModuleFile } from "../../utils/createTrainingModalHelpers";
import {
  getStageStatuses,
  getStageStatusesFromSnapshot,
  getStageStatusColor,
  getStatusColor,
  getStatusLabel,
} from "../../types/review.types";
import type { ReviewCycleSnapshot, ReviewCycleStatus, QuestionResponse } from "../../types/review.types";

const ACTION_PLAN_PERIODS = ["30", "60", "90"] as const;

export interface PastReviewDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycleId: string | null;
  viewType?: "past" | "active";
}

function renderResponses(responses: QuestionResponse[]) {
  if (!responses?.length) {
    return <p className="text-sm text-gray-400 italic">No responses</p>;
  }
  return (
    <div className="space-y-3">
      {responses.map((r) => (
        <div key={r.questionId} className="text-sm">
          <span className="font-medium text-gray-700">{r.questionText}</span>
          <p className="text-gray-800 mt-0.5 whitespace-pre-wrap">{r.answer}</p>
        </div>
      ))}
    </div>
  );
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

export const PastReviewDetailModal = ({ isOpen, onClose, cycleId, viewType = "past" }: PastReviewDetailModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ReviewCycleSnapshot | null>(null);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !cycleId) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await reviewService.getCycleSnapshot(cycleId);
        if (!cancelled) setSnapshot(data);
      } catch {
        toast.error("Failed to load review detail");
        if (!cancelled) setSnapshot(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, cycleId]);

  const cycle = snapshot?.cycle;
  const status = cycle?.status as ReviewCycleStatus | undefined;
  const stages = useMemo(() => {
    if (!cycle || !snapshot) return null;
    if (cycle.status === "cycle_superseded") {
      return getStageStatusesFromSnapshot(snapshot);
    }
    return getStageStatuses(cycle.status as ReviewCycleStatus);
  }, [cycle, snapshot]);
  const emp = cycle && typeof cycle.employeeId === "object" ? cycle.employeeId : null;
  const employeeName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : "Employee";
  const employeeRole = emp?.role?.trim() || "—";

  const actionPlanItems = snapshot?.actionPlan?.items ?? [];
  const otherActionPlanItems = actionPlanItems.filter(
    (i) => !(ACTION_PLAN_PERIODS as readonly string[]).includes(String(i.period)),
  );
  const getCheckInProgressRows = (ci: { actionItemProgress?: { actionPlanItemIndex: number; value?: string }[] }) =>
    (ci.actionItemProgress ?? [])
      .map((p) => ({ progress: p, planItem: actionPlanItems[p.actionPlanItemIndex] }))
      .filter((row): row is { progress: { actionPlanItemIndex: number; value?: string }; planItem: (typeof actionPlanItems)[number] } => Boolean(row.planItem));
  const hasValidPublicId = (publicId?: string): boolean =>
    Boolean(publicId && publicId.trim() && !/^https?:\/\//i.test(publicId));
  const getLegacyUrl = (doc: { url?: string; publicId?: string }): string | null => {
    if (doc.url?.trim()) return doc.url.trim();
    if (doc.publicId && /^https?:\/\//i.test(doc.publicId)) return doc.publicId;
    return null;
  };
  const isImageDoc = (doc: { resourceType?: string; format?: string; filename?: string; url?: string }): boolean => {
    if (doc.resourceType === "image") return true;
    const format = getDocumentFormatFromApiModuleFile(doc);
    if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(format)) return true;
    const rawUrl = doc.url?.split("?")[0] ?? "";
    return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(rawUrl);
  };

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      onClose={onClose}
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
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 id="past-review-detail-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              {viewType === "active" ? "Employee Review" : "Past Review"}
            </h2>
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden border-x border-gray-200">
            {cycle ? (
              <div className="px-5 pt-4 pb-3 border-b border-gray-200 flex-shrink-0 bg-card-background">
                <p className="text-sm text-secondary">
                  <span className="font-semibold text-primary">{employeeName}</span>
                  <span>{` · ${employeeRole}`}</span>
                  {cycle.cycleNumber != null ? <span>{` · Cycle #${cycle.cycleNumber}`}</span> : null}
                </p>
                {status ? (
                  <span
                    className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(status)}`}
                  >
                    {getStatusLabel(status)}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-5 md:[scrollbar-gutter:stable]">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Spinner size="lg" className="text-button-primary" />
                </div>
              ) : !snapshot || !cycle ? (
                <p className="text-sm text-gray-500 py-8 text-center">No data</p>
              ) : (
                <div className="space-y-6">
            {stages && (
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
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-blue-50/50 rounded-lg p-4 border border-blue-100">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">Self-review</h3>
                {snapshot.selfReview
                  ? renderResponses(snapshot.selfReview.responses ?? [])
                  : (
                    <p className="text-sm text-gray-400 italic">No self-review</p>
                  )}
                {snapshot.selfReview?.submittedAt && (
                  <p className="text-xs text-gray-500 mt-3">
                    Submitted {new Date(snapshot.selfReview.submittedAt).toLocaleString()}
                  </p>
                )}
              </section>

              <section className="bg-violet-50/50 rounded-lg p-4 border border-violet-100">
                <h3 className="text-sm font-semibold text-violet-800 mb-2">Manager review</h3>
                <p className="text-xs text-gray-600 mb-3">
                  <span className="text-gray-500">Reviewed by </span>
                  <span className="font-semibold text-gray-900">{personLabel(cycle.reviewedByManagerId)}</span>
                  {personRole(cycle.reviewedByManagerId) ? (
                    <span className="text-gray-500"> · {personRole(cycle.reviewedByManagerId)}</span>
                  ) : null}
                </p>
                {snapshot.managerReview ? (
                  <>
                    {snapshot.managerReview.revisionHistory &&
                    snapshot.managerReview.revisionHistory.length >= 2 ? (
                      <>
                        <div>
                          <h4 className="text-xs font-semibold text-violet-700 mb-2">
                            Original (before viewing employee self-review)
                          </h4>
                          {renderResponses(snapshot.managerReview.revisionHistory[0]?.responses ?? [])}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-violet-700 mb-2">
                            Updated (after viewing employee self-review)
                          </h4>
                          {renderResponses(snapshot.managerReview.revisionHistory.at(-1)?.responses ?? [])}
                        </div>
                      </>
                    ) : (
                      <div>
                        {renderResponses(snapshot.managerReview.responses ?? [])}
                      </div>
                    )}
                    {snapshot.managerReview.submittedAt && (
                      <p className="text-xs text-gray-500 mt-3">
                        Submitted {new Date(snapshot.managerReview.submittedAt).toLocaleString()}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-400 italic">No manager review</p>
                )}
              </section>
            </div>

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
                    {personLabel(cycle.approvedByDirectorId)}
                    {personRole(cycle.approvedByDirectorId) ? (
                      <span className="text-gray-500 font-normal"> · {personRole(cycle.approvedByDirectorId)}</span>
                    ) : null}
                  </dd>
                </div>
                {cycle.salaryIncrement != null && cycle.salaryIncrement !== undefined && (
                  <div>
                    <dt className="text-gray-500 text-xs">Salary increment</dt>
                    <dd className="font-medium">{String(cycle.salaryIncrement)}</dd>
                  </div>
                )}
              </dl>
              {cycle.directorComments ? (
                <div className="mt-3 text-sm">
                  <span className="text-gray-500 text-xs block mb-1">Comments</span>
                  <p className="text-gray-800 whitespace-pre-wrap">{cycle.directorComments}</p>
                </div>
              ) : null}
            </section>

            <section className="rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-semibold text-primary mb-3">Action plan</h3>
              {snapshot.actionPlan?.items?.length ? (
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
                              {group.map((item, i) => (
                                <tr
                                  key={`${period}-${item.description}-${i}`}
                                  className={i % 2 === 1 ? "bg-gray-50" : ""}
                                >
                                  <td className="py-2 pr-2">{item.description}</td>
                                  <td className="py-2 pr-2">{item.targetScore ?? "N/A"}</td>
                                  <td className="py-2">{item.currentScore ?? "N/A"}</td>
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
                            {otherActionPlanItems.map((item, i) => (
                              <tr key={`other-${i}`} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                                <td className="py-2 pr-2 whitespace-nowrap">{item.period} days</td>
                                <td className="py-2 pr-2">{item.description}</td>
                                <td className="py-2 pr-2">{item.targetScore ?? "N/A"}</td>
                                <td className="py-2">{item.currentScore ?? "N/A"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No action plan</p>
              )}
            </section>

            <section className="rounded-lg p-4 border border-gray-200">
              <h3 className="text-sm font-semibold text-primary mb-3">Check-ins</h3>
              {!snapshot.checkIns?.length ? (
                <p className="text-sm text-gray-400 italic">No check-ins</p>
              ) : (
                <ul className="space-y-4">
                  {snapshot.checkIns.map((ci) => (
                    <li
                      key={ci._id}
                      className="border border-gray-100 rounded-lg p-3 bg-gray-50/50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-semibold text-primary">{ci.period}-day check-in</span>
                        <span className="text-xs text-gray-500">
                          {ci.submittedAt ? new Date(ci.submittedAt).toLocaleString() : ""}
                        </span>
                      </div>
                      {renderResponses(ci.responses ?? [])}
                      {getCheckInProgressRows(ci).length > 0 ? (
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
                              {getCheckInProgressRows(ci).map(({ progress, planItem }, idx) => (
                                <tr
                                  key={`${ci._id}-progress-${progress.actionPlanItemIndex}-${idx}`}
                                  className={idx % 2 === 1 ? "bg-gray-50" : ""}
                                >
                                  <td className="py-2 pr-2">{planItem.description}</td>
                                  <td className="py-2 pr-2">{planItem.currentScore ?? "N/A"}</td>
                                  <td className="py-2 pr-2">{progress.value?.trim() || "N/A"}</td>
                                  <td className="py-2">{planItem.targetScore ?? "N/A"}</td>
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
                      {(ci.documents?.length ?? 0) > 0 ? (
                        <div className="mt-3 space-y-1">
                          <p className="text-sm font-medium text-gray-600">Documents:</p>
                          <ul className="space-y-1 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                            {ci.documents?.map((doc, idx) => (
                              <li key={`${ci._id}-doc-${idx}`} className="flex items-center gap-2 px-3 py-1.5 min-w-0">
                                {isImageDoc(doc) && (hasValidPublicId(doc.publicId) || getLegacyUrl(doc)) ? (
                                  <img
                                    src={
                                      hasValidPublicId(doc.publicId)
                                        ? getDocumentProxyUrl(doc.publicId!, "image")
                                        : (getLegacyUrl(doc) ?? "")
                                    }
                                    alt=""
                                    className="w-12 h-12 rounded object-cover border border-gray-200 flex-shrink-0"
                                  />
                                ) : (
                                  <DocumentTypeThumbnail format={getDocumentFormatFromApiModuleFile(doc)} />
                                )}
                                <span className="text-sm text-primary truncate min-w-0 flex-1" title={doc.filename ?? "File"}>
                                  {doc.filename?.trim() || `Document ${idx + 1}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
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
                                  }}
                                  className="p-1 text-primary hover:bg-gray-100 rounded shrink-0"
                                  aria-label="View file"
                                  title="View file"
                                >
                                  <ViewIcon className="w-4 h-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : ci.documentUrl ? (
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
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="text-xs text-gray-500 border-t pt-4">
              <p>
                Reference {cycle.referenceDate ? new Date(cycle.referenceDate).toLocaleDateString() : "—"}
                {" · "}
                Due (90d){" "}
                {cycle.dueDate90 ? new Date(cycle.dueDate90).toLocaleDateString() : "—"}
              </p>
              {cycle.completedAt && (
                <p className="mt-1">Completed {new Date(cycle.completedAt).toLocaleString()}</p>
              )}
            </section>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
