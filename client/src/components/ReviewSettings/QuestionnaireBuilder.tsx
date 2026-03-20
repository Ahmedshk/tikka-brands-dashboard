import { useState } from "react";
import { IoTrashOutline } from "react-icons/io5";
import { ConfirmDialog } from "../modal/ConfirmDialog";
import type { Question, QuestionType } from "../../types/review.types";

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

export const QuestionnaireBuilder = ({ title, questions, onChange }: QuestionnaireBuilderProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);

  const questionToDeleteText = questions.find((q) => q.id === questionToDelete)?.text || "(Untitled question)";

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

  const removeQuestion = (id: string) => {
    onChange(
      questions
        .filter((q) => q.id !== id)
        .map((q, i) => ({ ...q, order: i })),
    );
    if (expandedId === id) setExpandedId(null);
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

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-primary">{title}</h3>
        <button
          type="button"
          onClick={addQuestion}
          className="px-3 py-1.5 bg-button-primary text-white text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          + Add Question
        </button>
      </div>

      {questions.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">No questions added yet. Click "Add Question" to start.</p>
      )}

      <div className="space-y-3">
        {questions.map((q, index) => (
          <div
            key={q.id}
            className="border border-gray-100 rounded-lg bg-gray-50/50"
          >
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
            >
              <span className="text-xs font-medium text-gray-400 w-6">{index + 1}.</span>
              <span className="flex-1 text-sm text-primary truncate">
                {q.text || "(Untitled question)"}
              </span>
              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                {QUESTION_TYPE_LABELS[q.type]}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); moveQuestion(index, -1); }}
                  disabled={index === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); moveQuestion(index, 1); }}
                  disabled={index === questions.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 cursor-pointer"
                  title="Move down"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setQuestionToDelete(q.id); }}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                  title="Delete question"
                >
                  <IoTrashOutline className="w-4 h-4" />
                </button>
              </div>
            </div>

            {expandedId === q.id && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Question Text</label>
                  <input
                    type="text"
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                    placeholder="Enter question text..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 focus:border-button-primary"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                    <select
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
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 focus:border-button-primary"
                    >
                      {(Object.entries(QUESTION_TYPE_LABELS) as [QuestionType, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id={`required-${q.id}`}
                      checked={q.required}
                      onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor={`required-${q.id}`} className="text-xs text-gray-600">Required</label>
                  </div>
                </div>

                {q.type === "multiple_choice" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Options</label>
                    <div className="space-y-2">
                      {(q.options ?? []).map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...(q.options ?? [])];
                              newOpts[oi] = e.target.value;
                              updateQuestion(q.id, { options: newOpts });
                            }}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 focus:border-button-primary"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newOpts = (q.options ?? []).filter((_, i) => i !== oi);
                              updateQuestion(q.id, { options: newOpts });
                            }}
                            className="text-red-400 hover:text-red-600 text-sm cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          updateQuestion(q.id, {
                            options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`],
                          });
                        }}
                        className="text-xs text-button-primary hover:underline cursor-pointer"
                      >
                        + Add option
                      </button>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        ))}
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
};
