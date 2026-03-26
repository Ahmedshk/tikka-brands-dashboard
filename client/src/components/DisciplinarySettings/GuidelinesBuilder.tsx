import { useState } from "react";
import { IoTrashOutline } from "react-icons/io5";
import { FiPlus } from "react-icons/fi";
import type { DisciplineGuideline } from "../../services/disciplinarySettings.service";

function generateId(): string {
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface GuidelinesBuilderProps {
  readonly guidelines: DisciplineGuideline[];
  readonly onChange: (guidelines: DisciplineGuideline[]) => void;
}

export const GuidelinesBuilder = ({
  guidelines,
  onChange,
}: GuidelinesBuilderProps) => {
  const [thresholdDraft, setThresholdDraft] = useState<Record<string, string>>(
    {},
  );

  const addGuideline = () => {
    const newGuideline: DisciplineGuideline = {
      id: generateId(),
      pointThreshold: 0,
      action: "",
    };
    onChange([...guidelines, newGuideline]);
  };

  const updateGuideline = (
    id: string,
    updates: Partial<DisciplineGuideline>,
  ) => {
    onChange(
      guidelines.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    );
  };

  const removeGuideline = (id: string) => {
    setThresholdDraft((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    onChange(guidelines.filter((g) => g.id !== id));
  };

  const handleThresholdChange = (id: string, raw: string) => {
    if (raw !== "" && !/^\d+$/.test(raw)) return;
    setThresholdDraft((prev) => ({ ...prev, [id]: raw }));
    updateGuideline(id, {
      pointThreshold:
        raw === "" ? 0 : Math.max(0, Number.parseInt(raw, 10)),
    });
  };

  const clearThresholdDraft = (id: string) => {
    setThresholdDraft((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">
          Discipline Guidelines{" "}
          <span className="text-xs font-normal text-tertiary">
            (NOT GUARANTEES)
          </span>
        </h3>
        <button
          type="button"
          onClick={addGuideline}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <FiPlus className="w-3.5 h-3.5" />
          Add Guideline
        </button>
      </div>

      <p className="text-xs text-tertiary mb-4">
        Define what action is taken when an employee reaches a certain point
        threshold. Order stays as you edit until you save or reload the page,
        then rows are sorted by threshold.
      </p>

      {guidelines.length === 0 && (
        <p className="text-sm text-tertiary italic py-4">
          No guidelines configured yet.
        </p>
      )}

      <div className="space-y-3">
        {guidelines.map((guideline) => {
          const thresholdId = `discipline-guideline-threshold-${guideline.id}`;
          const actionId = `discipline-guideline-action-${guideline.id}`;
          return (
            <div
              key={guideline.id}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
                <div className="flex min-w-0 flex-1 flex-col sm:w-24 sm:flex-none">
                  <label
                    htmlFor={thresholdId}
                    className="block text-xs font-medium text-tertiary mb-1"
                  >
                    Points threshold
                  </label>
                  <input
                    id={thresholdId}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={
                      thresholdDraft[guideline.id] ??
                      String(guideline.pointThreshold)
                    }
                    onChange={(e) =>
                      handleThresholdChange(guideline.id, e.target.value)
                    }
                    onBlur={() => clearThresholdDraft(guideline.id)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <label
                    htmlFor={actionId}
                    className="block text-xs font-medium text-tertiary mb-1"
                  >
                    Action
                  </label>
                  <input
                    id={actionId}
                    type="text"
                    value={guideline.action}
                    onChange={(e) =>
                      updateGuideline(guideline.id, { action: e.target.value })
                    }
                    placeholder="e.g., Verbal coaching"
                    className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeGuideline(guideline.id)}
                className="mt-1 shrink-0 p-1.5 text-red-400 hover:text-red-600 cursor-pointer"
                title="Remove guideline"
              >
                <IoTrashOutline className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
