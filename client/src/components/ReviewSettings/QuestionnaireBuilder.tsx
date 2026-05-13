import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { IoTrashOutline } from "react-icons/io5";
import UploadIcon from "@assets/icons/upload.svg?react";
import ViewIcon from "@assets/icons/view.svg?react";
import { ProxiedImageThumbnail } from "../common/ProxiedImageThumbnail";
import { ConfirmDialog } from "../modal/ConfirmDialog";
import { DocumentTypeThumbnail } from "../modal/DocumentTypeThumbnail";
import type { Question, QuestionType, ReviewQuestionAttachment } from "../../types/review.types";
import {
  TRAINING_DOCUMENT_ACCEPT,
  PENDING_LOCAL_FILE_ROW_CLASSNAME,
  PENDING_UPLOAD_TAG_CLASSNAME,
  SAVED_REMOTE_FILE_ROW_CLASSNAME,
  getDocumentFormatFromFile,
  openFileInNewTab,
} from "../../utils/createTrainingModalHelpers";
import { isImageFile, newQuestionnairePendingFileId } from "../../utils/reviewQuestionnaireHelpers";
import { openDocumentProxyInNewTab } from "../../services/training.service";
import { reviewService } from "../../services/review.service";
import { getStableOptionKey, removeAt, replaceAt } from "../../utils/questionnaireBuilderHelpers";

export interface QuestionnaireBuilderHandle {
  /** Upload all pending files and merge into `attachments`; clears pending state. Returns the latest questions for saving (parent state may lag `onChange`). */
  flushPendingUploads: () => Promise<Question[]>;
}

interface QuestionnaireBuilderProps {
  title: string;
  questions: Question[];
  onChange: (questions: Question[]) => void;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  text: "Text",
  rating: "Rating (1-5)",
  multiple_choice: "Multiple Choice",
  yes_no: "Yes / No",
};

function generateId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function FilePreviewThumbnail({ file }: { readonly file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <div className="w-8 h-8 rounded bg-gray-200 animate-pulse shrink-0" />;
  return <img src={url} alt="" className="w-8 h-8 rounded object-cover border border-gray-200 shrink-0" />;
}

export const QuestionnaireBuilder = forwardRef<QuestionnaireBuilderHandle, QuestionnaireBuilderProps>(
  function QuestionnaireBuilder({ title, questions, onChange }, ref) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
    const [pendingByQuestionId, setPendingByQuestionId] = useState<Record<string, { id: string; file: File }[]>>(
      {},
    );

    const questionToDeleteText = questions.find((q) => q.id === questionToDelete)?.text || "(Untitled question)";

    useImperativeHandle(ref, () => ({
      flushPendingUploads: async () => {
        const entries = Object.entries(pendingByQuestionId).filter(([, files]) => files.length > 0);
        if (entries.length === 0) return questions;

        let nextQuestions = [...questions];
        const clearedPending: Record<string, { id: string; file: File }[]> = { ...pendingByQuestionId };

        for (const [qid, files] of entries) {
          const uploaded: ReviewQuestionAttachment[] = [];
          for (const pf of files) {
            const up = await reviewService.uploadQuestionnaireDocument(pf.file);
            uploaded.push({
              publicId: up.publicId,
              resourceType: up.resourceType,
              filename: up.filename,
              format: up.format,
            });
          }
          nextQuestions = nextQuestions.map((x) =>
            x.id === qid ? { ...x, attachments: [...(x.attachments ?? []), ...uploaded] } : x,
          );
          clearedPending[qid] = [];
        }

        onChange(nextQuestions);
        setPendingByQuestionId(clearedPending);
        return nextQuestions;
      },
    }), [questions, pendingByQuestionId, onChange]);

    const addQuestion = () => {
      const newQ: Question = {
        id: generateId(),
        text: "",
        type: "text",
        required: true,
        order: questions.length,
      };
      onChange([...questions, newQ]);
      setExpandedId(newQ.id);
    };

    const updateQuestion = (id: string, updates: Partial<Question>) => {
      onChange(questions.map((q) => (q.id === id ? { ...q, ...updates } : q)));
    };

    const removeQuestion = (qid: string) => {
      onChange(
        questions
          .filter((q) => q.id !== qid)
          .map((q, i) => ({ ...q, order: i })),
      );
      setPendingByQuestionId((prev) => {
        const next = { ...prev };
        delete next[qid];
        return next;
      });
      if (expandedId === qid) setExpandedId(null);
    };

    const moveQuestion = (index: number, direction: -1 | 1) => {
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= questions.length) return;
      const reordered = [...questions];
      const temp = reordered[index]!;
      reordered[index] = reordered[newIndex]!;
      reordered[newIndex] = temp;
      onChange(reordered.map((q, i) => ({ ...q, order: i })));
    };

    const addPendingFiles = (qid: string, fileList: FileList | null) => {
      if (!fileList?.length) return;
      const newEntries = Array.from(fileList).map((file) => ({
        id: newQuestionnairePendingFileId(),
        file,
      }));
      setPendingByQuestionId((prev) => ({
        ...prev,
        [qid]: [...(prev[qid] ?? []), ...newEntries],
      }));
    };

    const removePendingFile = (qid: string, fileId: string) => {
      setPendingByQuestionId((prev) => ({
        ...prev,
        [qid]: (prev[qid] ?? []).filter((f) => f.id !== fileId),
      }));
    };

    const removeSavedAttachment = (qid: string, publicId: string) => {
      const q = questions.find((x) => x.id === qid);
      if (!q) return;
      updateQuestion(qid, {
        attachments: (q.attachments ?? []).filter((a) => a.publicId !== publicId),
      });
    };

    return (
      <div className="border border-gray-200 rounded-xl p-3 sm:p-4 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-base font-semibold text-primary">{title}</h3>
          <button
            type="button"
            onClick={addQuestion}
            className="w-full sm:w-auto px-3 py-2 bg-button-primary text-white text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            + Add Question
          </button>
        </div>

        {questions.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No questions added yet. Click &quot;Add Question&quot; to start.</p>
        )}

        <div className="space-y-3">
          {questions.map((q, index) => {
            const pending = pendingByQuestionId[q.id] ?? [];
            const saved = q.attachments ?? [];

            return (
              <div key={q.id} className="border border-gray-100 rounded-lg bg-gray-50/50">
                <div
                  className="px-3 sm:px-4 py-3 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-400 w-5 sm:w-6 shrink-0 pt-0.5">{index + 1}.</span>
                    <span className="flex-1 min-w-0 text-sm text-primary leading-5 break-words">
                      {q.text || "(Untitled question)"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-7 sm:pl-8">
                    <span className="text-[11px] sm:text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded shrink-0">
                      {QUESTION_TYPE_LABELS[q.type]}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveQuestion(index, -1);
                        }}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveQuestion(index, 1);
                        }}
                        disabled={index === questions.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
                        title="Move down"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setQuestionToDelete(q.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                        title="Delete question"
                      >
                        <IoTrashOutline className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {expandedId === q.id && (
                  <div className="px-3 sm:px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                    <div>
                      <label
                        htmlFor={`question-text-${q.id}`}
                        className="block text-xs font-medium text-gray-500 mb-1"
                      >
                        Question Text
                      </label>
                      <input
                        id={`question-text-${q.id}`}
                        type="text"
                        value={q.text}
                        onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                        placeholder="Enter question text..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 focus:border-button-primary"
                      />
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
                      <div className="w-full sm:w-auto sm:max-w-xs sm:shrink-0">
                        <label
                          htmlFor={`question-type-${q.id}`}
                          className="block text-xs font-medium text-gray-500 mb-1"
                        >
                          Type
                        </label>
                        <select
                          id={`question-type-${q.id}`}
                          value={q.type}
                          onChange={(e) => {
                            const newType = e.target.value as QuestionType;
                            const updates: Partial<Question> = { type: newType };
                            if (newType === "multiple_choice" && !q.options?.length) {
                              updates.options = ["Option 1", "Option 2"];
                            }
                            if (newType !== "multiple_choice") {
                              updates.options = undefined;
                            }
                            updateQuestion(q.id, updates);
                          }}
                          className="w-full min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 focus:border-button-primary"
                        >
                          {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([val, label]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 sm:pb-0.5">
                        <input
                          type="checkbox"
                          id={`required-${q.id}`}
                          checked={q.required}
                          onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                          className="rounded"
                        />
                        <label htmlFor={`required-${q.id}`} className="text-xs text-gray-600">
                          Required
                        </label>
                      </div>
                    </div>

                    {q.type === "multiple_choice" && (
                      <fieldset>
                        <legend className="block text-xs font-medium text-gray-500 mb-1">Options</legend>
                        <div className="space-y-2">
                          {(q.options ?? []).map((opt, oi) => (
                            <div
                              key={getStableOptionKey(q.id, q.options ?? [], opt, oi)}
                              className="flex flex-col sm:flex-row sm:items-center gap-2"
                            >
                              <input
                                type="text"
                                value={opt}
                                onChange={(e) =>
                                  updateQuestion(q.id, { options: replaceAt(q.options ?? [], oi, e.target.value) })
                                }
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 focus:border-button-primary"
                              />
                              <button
                                type="button"
                                onClick={() => updateQuestion(q.id, { options: removeAt(q.options ?? [], oi) })}
                                className="self-end sm:self-auto text-red-400 hover:text-red-600 text-sm cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              updateQuestion(q.id, {
                                options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`],
                              })
                            }
                            className="text-xs text-button-primary hover:underline cursor-pointer"
                          >
                            + Add option
                          </button>
                        </div>
                      </fieldset>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-primary">Question documents</span>
                        <input
                          id={`question-files-input-${q.id}`}
                          type="file"
                          accept={TRAINING_DOCUMENT_ACCEPT}
                          multiple
                          onChange={(e) => {
                            addPendingFiles(q.id, e.target.files);
                            e.target.value = "";
                          }}
                          className="sr-only"
                          aria-label="Upload reference documents"
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById(`question-files-input-${q.id}`)?.click()}
                          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-xs font-medium text-primary bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0"
                        >
                          <UploadIcon className="w-4 h-4" />
                          Upload files
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500 mb-2">
                        Files upload when you save Review Settings.
                      </p>
                      {saved.length > 0 || pending.length > 0 ? (
                        <ul className="space-y-2">
                          {saved.map((att) => (
                            <li
                              key={att.publicId}
                              className={SAVED_REMOTE_FILE_ROW_CLASSNAME}
                            >
                              {att.resourceType === "image" ? (
                                <ProxiedImageThumbnail
                                  publicId={att.publicId}
                                  fallbackFormat={att.format ?? "png"}
                                />
                              ) : (
                                <DocumentTypeThumbnail format={att.format ?? "pdf"} />
                              )}
                              <span
                                className="text-sm text-primary truncate min-w-0 flex-1"
                                title={att.filename ?? att.publicId}
                              >
                                {att.filename?.trim() || att.format?.trim() || "Document"}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void openDocumentProxyInNewTab(
                                      att.publicId,
                                      att.resourceType,
                                      att.filename,
                                    )
                                  }
                                  className="p-1.5 text-primary hover:bg-gray-100 rounded"
                                  aria-label="View file"
                                  title="View file"
                                >
                                  <ViewIcon className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeSavedAttachment(q.id, att.publicId)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                  aria-label="Remove file"
                                  title="Remove from question"
                                >
                                  <span className="text-lg leading-none" aria-hidden>
                                    ×
                                  </span>
                                </button>
                              </div>
                            </li>
                          ))}
                          {pending.map((pf) => (
                            <li
                              key={pf.id}
                              className={PENDING_LOCAL_FILE_ROW_CLASSNAME}
                            >
                              {isImageFile(pf.file) ? (
                                <FilePreviewThumbnail file={pf.file} />
                              ) : (
                                <DocumentTypeThumbnail format={getDocumentFormatFromFile(pf.file)} />
                              )}
                              <span className="text-sm text-primary truncate min-w-0 flex-1" title={pf.file.name}>
                                {pf.file.name}
                                <span className={PENDING_UPLOAD_TAG_CLASSNAME}>(pending upload)</span>
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openFileInNewTab(pf.file)}
                                  className="p-1.5 text-primary hover:bg-gray-100 rounded"
                                  aria-label="View file"
                                  title="View file"
                                >
                                  <ViewIcon className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removePendingFile(q.id, pf.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                  aria-label="Remove file"
                                >
                                  <span className="text-lg leading-none" aria-hidden>
                                    ×
                                  </span>
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <ConfirmDialog
          isOpen={questionToDelete !== null}
          onClose={() => setQuestionToDelete(null)}
          title="Delete Question"
          message={`Are you sure you want to delete "${questionToDeleteText}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            if (questionToDelete) removeQuestion(questionToDelete);
            setQuestionToDelete(null);
          }}
        />
      </div>
    );
  },
);
