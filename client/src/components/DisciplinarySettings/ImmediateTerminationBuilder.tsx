import { useEffect, useState } from "react";
import { IoTrashOutline, IoChevronDown, IoChevronForward } from "react-icons/io5";
import { FiPlus } from "react-icons/fi";
import type { ImmediateTerminationPolicy } from "../../services/disciplinarySettings.service";

function generateId(): string {
  return `it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function autoResizeTextarea(element: HTMLTextAreaElement): void {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

interface ImmediateTerminationBuilderProps {
  readonly policies: ImmediateTerminationPolicy[];
  readonly onChange: (policies: ImmediateTerminationPolicy[]) => void;
}

export const ImmediateTerminationBuilder = ({
  policies,
  onChange,
}: ImmediateTerminationBuilderProps) => {
  const [expandedPolicyIds, setExpandedPolicyIds] = useState<Set<string>>(
    () => new Set(),
  );

  const policyIdsKey = policies.map((p) => p.id).join("|");

  useEffect(() => {
    if (policyIdsKey === "") {
      setExpandedPolicyIds(new Set());
      return;
    }

    const valid = new Set(policyIdsKey.split("|"));
    setExpandedPolicyIds(
      (prev) => new Set([...prev].filter((id) => valid.has(id))),
    );
  }, [policyIdsKey]);

  const togglePolicyExpanded = (policyId: string) => {
    setExpandedPolicyIds((prev) => {
      const next = new Set(prev);
      if (next.has(policyId)) next.delete(policyId);
      else next.add(policyId);
      return next;
    });
  };

  const addPolicy = () => {
    const newId = generateId();
    onChange([...policies, { id: newId, title: "", description: "" }]);
    setExpandedPolicyIds(new Set([newId]));
  };

  const updatePolicy = (
    id: string,
    updates: Partial<ImmediateTerminationPolicy>,
  ) => {
    onChange(policies.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removePolicy = (id: string) => {
    setExpandedPolicyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onChange(policies.filter((p) => p.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">
          Immediate Termination Policies
        </h3>
        <button
          type="button"
          onClick={addPolicy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <FiPlus className="w-3.5 h-3.5" />
          Add Policy
        </button>
      </div>

      <p className="text-xs text-tertiary mb-4">
        These policies result in immediate termination and do not carry a point
        value.
      </p>

      {policies.length === 0 && (
        <p className="text-sm text-tertiary italic py-4">
          No immediate termination policies yet.
        </p>
      )}

      <div className="space-y-3">
        {policies.map((policy) => {
          const isExpanded = expandedPolicyIds.has(policy.id);
          const headerTitle =
            policy.title.trim() || "Untitled policy";
          return (
            <div
              key={policy.id}
              className="border border-gray-200 rounded-lg overflow-hidden bg-card-background"
            >
              <div
                className={`flex items-center gap-2 px-3 py-2.5 ${
                  isExpanded ? "border-b border-gray-200" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => togglePolicyExpanded(policy.id)}
                  className="flex flex-1 min-w-0 items-center gap-2 text-left rounded-lg py-1 -my-1 px-1 -ml-1 hover:bg-gray-100/80 transition-colors cursor-pointer"
                  aria-expanded={isExpanded}
                  aria-controls={`termination-policy-body-${policy.id}`}
                  id={`termination-policy-toggle-${policy.id}`}
                >
                  <span className="shrink-0 text-tertiary" aria-hidden>
                    {isExpanded ? (
                      <IoChevronDown className="w-5 h-5" />
                    ) : (
                      <IoChevronForward className="w-5 h-5" />
                    )}
                  </span>
                  <span className="flex-1 min-w-0 font-medium text-sm text-primary truncate">
                    {headerTitle}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removePolicy(policy.id)}
                  className="shrink-0 p-1.5 text-red-400 hover:text-red-600 cursor-pointer"
                  title="Remove policy"
                >
                  <IoTrashOutline className="w-4 h-4" />
                </button>
              </div>

              {isExpanded && (
                <section
                  id={`termination-policy-body-${policy.id}`}
                  aria-labelledby={`termination-policy-toggle-${policy.id}`}
                  className="p-4 pt-3"
                >
                  <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                    <div>
                      <label
                        htmlFor={`termination-policy-title-${policy.id}`}
                        className="block text-xs font-medium text-tertiary mb-1"
                      >
                        Policy title
                      </label>
                      <input
                        id={`termination-policy-title-${policy.id}`}
                        type="text"
                        value={policy.title}
                        onChange={(e) =>
                          updatePolicy(policy.id, { title: e.target.value })
                        }
                        placeholder="Policy title"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`termination-policy-description-${policy.id}`}
                        className="block text-xs font-medium text-tertiary mb-1"
                      >
                        Description (optional)
                      </label>
                      <textarea
                        id={`termination-policy-description-${policy.id}`}
                        value={policy.description}
                        onChange={(e) =>
                          updatePolicy(policy.id, {
                            description: e.target.value,
                          })
                        }
                        onInput={(e) => autoResizeTextarea(e.currentTarget)}
                        ref={(element) => {
                          if (!element) return;
                          autoResizeTextarea(element);
                        }}
                        placeholder="Optional details about this policy…"
                        rows={1}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
                      />
                    </div>
                  </div>
                </section>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
