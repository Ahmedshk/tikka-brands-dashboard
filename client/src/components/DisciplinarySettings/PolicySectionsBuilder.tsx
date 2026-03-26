import { useEffect, useState } from "react";
import { IoTrashOutline, IoChevronDown, IoChevronForward } from "react-icons/io5";
import { FiPlus } from "react-icons/fi";
import type {
  DisciplinaryPolicySection,
  DisciplinaryPolicy,
} from "../../services/disciplinarySettings.service";

function generateId(): string {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function policyPointsKey(sectionId: string, policyId: string): string {
  return `${sectionId}|${policyId}`;
}

function autoResizeTextarea(element: HTMLTextAreaElement): void {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

interface PolicySectionsBuilderProps {
  readonly sections: DisciplinaryPolicySection[];
  readonly onChange: (sections: DisciplinaryPolicySection[]) => void;
}

export const PolicySectionsBuilder = ({
  sections,
  onChange,
}: PolicySectionsBuilderProps) => {
  /** Lets users clear the field while typing; parent still stores a number (0 when empty). */
  const [policyPointsDraft, setPolicyPointsDraft] = useState<
    Record<string, string>
  >({});

  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );

  const sectionIdsKey = sections.map((s) => s.id).join("|");

  useEffect(() => {
    if (sectionIdsKey === "") {
      setExpandedSectionIds(new Set());
      return;
    }

    const valid = new Set(sectionIdsKey.split("|"));
    setExpandedSectionIds(
      (prev) => new Set([...prev].filter((id) => valid.has(id))),
    );
  }, [sectionIdsKey]);

  const toggleSectionExpanded = (sectionId: string) => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const addSection = () => {
    const newId = generateId();
    onChange([
      ...sections,
      {
        id: newId,
        name: "",
        order: sections.length,
        policies: [],
      },
    ]);
    setExpandedSectionIds(new Set([newId]));
  };

  const updateSection = (
    sectionId: string,
    updates: Partial<DisciplinaryPolicySection>,
  ) => {
    onChange(
      sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)),
    );
  };

  const removeSection = (sectionId: string) => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
    onChange(
      sections
        .filter((s) => s.id !== sectionId)
        .map((s, i) => ({ ...s, order: i })),
    );
  };

  const addPolicy = (sectionId: string) => {
    updateSection(sectionId, {
      policies: [
        ...(sections.find((s) => s.id === sectionId)?.policies ?? []),
        { id: generateId(), title: "", description: "", points: 0 },
      ],
    });
  };

  const updatePolicy = (
    sectionId: string,
    policyId: string,
    updates: Partial<DisciplinaryPolicy>,
  ) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    updateSection(sectionId, {
      policies: section.policies.map((p) =>
        p.id === policyId ? { ...p, ...updates } : p,
      ),
    });
  };

  const removePolicy = (sectionId: string, policyId: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const pk = policyPointsKey(sectionId, policyId);
    setPolicyPointsDraft((prev) => {
      if (!(pk in prev)) return prev;
      const next = { ...prev };
      delete next[pk];
      return next;
    });
    updateSection(sectionId, {
      policies: section.policies.filter((p) => p.id !== policyId),
    });
  };

  const handlePolicyPointsChange = (
    sectionId: string,
    policyId: string,
    pointsPk: string,
    raw: string,
  ) => {
    if (raw !== "" && !/^\d+$/.test(raw)) return;
    setPolicyPointsDraft((prev) => ({ ...prev, [pointsPk]: raw }));
    if (raw === "") {
      updatePolicy(sectionId, policyId, { points: 0 });
    } else {
      updatePolicy(sectionId, policyId, {
        points: Math.max(0, Number.parseInt(raw, 10)),
      });
    }
  };

  const clearPolicyPointsDraft = (pointsPk: string) => {
    setPolicyPointsDraft((prev) => {
      if (!(pointsPk in prev)) return prev;
      const next = { ...prev };
      delete next[pointsPk];
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">
          Policies
        </h3>
        <button
          type="button"
          onClick={addSection}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <FiPlus className="w-3.5 h-3.5" />
          Add Section
        </button>
      </div>

      {sections.length === 0 && (
        <p className="text-sm text-tertiary italic py-4">
          No policy sections yet. Click &quot;Add Section&quot; to create one.
        </p>
      )}

      <div className="space-y-3">
        {sections.map((section) => {
          const isExpanded = expandedSectionIds.has(section.id);
          const sectionTitle =
            section.name.trim() || "Untitled section";
          return (
          <div
            key={section.id}
            className="border border-gray-200 rounded-lg overflow-hidden bg-card-background"
          >
            <div
              className={`flex items-center gap-2 px-3 py-2.5 ${
                isExpanded ? "border-b border-gray-200" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSectionExpanded(section.id)}
                className="flex flex-1 min-w-0 items-center gap-2 text-left rounded-lg py-1 -my-1 px-1 -ml-1 hover:bg-gray-100/80 transition-colors cursor-pointer"
                aria-expanded={isExpanded}
                aria-controls={`disciplinary-section-body-${section.id}`}
                id={`disciplinary-section-toggle-${section.id}`}
              >
                <span className="shrink-0 text-tertiary" aria-hidden>
                  {isExpanded ? (
                    <IoChevronDown className="w-5 h-5" />
                  ) : (
                    <IoChevronForward className="w-5 h-5" />
                  )}
                </span>
                <span className="flex-1 min-w-0 font-medium text-sm text-primary truncate">
                  {sectionTitle}
                </span>
                <span className="shrink-0 text-xs text-tertiary tabular-nums">
                  {section.policies.length}{" "}
                  {section.policies.length === 1 ? "policy" : "policies"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => removeSection(section.id)}
                className="shrink-0 p-1.5 text-red-400 hover:text-red-600 cursor-pointer"
                title="Remove section"
              >
                <IoTrashOutline className="w-4 h-4" />
              </button>
            </div>

            {isExpanded && (
            <section
              id={`disciplinary-section-body-${section.id}`}
              aria-labelledby={`disciplinary-section-toggle-${section.id}`}
              className="p-4 pt-3"
            >
            <div className="mb-4">
              <label
                htmlFor={`disciplinary-section-name-${section.id}`}
                className="block text-xs font-medium text-tertiary mb-1"
              >
                Section name
              </label>
              <input
                id={`disciplinary-section-name-${section.id}`}
                type="text"
                value={section.name}
                onChange={(e) =>
                  updateSection(section.id, { name: e.target.value })
                }
                placeholder="e.g., Attendance & Punctuality"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary"
              />
            </div>

            {section.policies.map((policy) => {
              const pointsPk = policyPointsKey(section.id, policy.id);
              const pointsDraft = policyPointsDraft[pointsPk];
              return (
                <div
                  key={policy.id}
                  className="relative mb-4 rounded-xl border border-gray-200 bg-gray-50/60 p-3 pl-4 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-primary">
                      Policy
                    </div>
                    <button
                      type="button"
                      onClick={() => removePolicy(section.id, policy.id)}
                      className="p-1.5 text-red-400 hover:text-red-600 cursor-pointer"
                      title="Remove policy"
                    >
                      <IoTrashOutline className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
                      <div>
                        <label
                          htmlFor={`disciplinary-policy-title-${section.id}-${policy.id}`}
                          className="block text-xs font-medium text-tertiary mb-1"
                        >
                          Policy title
                        </label>
                        <input
                          id={`disciplinary-policy-title-${section.id}-${policy.id}`}
                          type="text"
                          value={policy.title}
                          onChange={(e) =>
                            updatePolicy(section.id, policy.id, {
                              title: e.target.value,
                            })
                          }
                          placeholder="e.g., Weekly On-Time Expectation"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`disciplinary-policy-points-${section.id}-${policy.id}`}
                          className="block text-xs font-medium text-tertiary mb-1"
                        >
                          Points
                        </label>
                        <input
                          id={`disciplinary-policy-points-${section.id}-${policy.id}`}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={pointsDraft ?? String(policy.points)}
                          onChange={(e) =>
                            handlePolicyPointsChange(
                              section.id,
                              policy.id,
                              pointsPk,
                              e.target.value,
                            )
                          }
                          onBlur={() => clearPolicyPointsDraft(pointsPk)}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary"
                        />
                      </div>
                    </div>

                    <div className="mt-2">
                      <label
                        htmlFor={`disciplinary-policy-description-${section.id}-${policy.id}`}
                        className="block text-xs font-medium text-tertiary mb-1"
                      >
                        Description (optional)
                      </label>
                      <textarea
                        id={`disciplinary-policy-description-${section.id}-${policy.id}`}
                        value={policy.description}
                        onChange={(e) =>
                          updatePolicy(section.id, policy.id, {
                            description: e.target.value,
                          })
                        }
                        onInput={(e) =>
                          autoResizeTextarea(e.currentTarget)
                        }
                        ref={(element) => {
                          if (!element) return;
                          autoResizeTextarea(element);
                        }}
                        placeholder="Describe the expectation and what counts as a violation…"
                        rows={1}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-card-background focus:outline-none focus:ring-2 focus:ring-button-primary/30 focus:border-button-primary resize-none overflow-hidden"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() => addPolicy(section.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
            >
              <FiPlus className="w-3.5 h-3.5" />
              Add Policy
            </button>
            </section>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
};
