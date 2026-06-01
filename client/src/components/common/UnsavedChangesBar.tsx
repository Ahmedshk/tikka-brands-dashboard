import { FiSave } from "react-icons/fi";

/** Brand accent for unsaved-changes bar (save CTA + left border). */
const UNSAVED_BAR_ACCENT = "#E46619";

const DEFAULT_DESCRIPTION =
  "Review and save to apply updates across your organization.";

export interface UnsavedChangesBarProps {
  visible: boolean;
  onDiscard: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  description?: string;
  /** When set, the save button submits this form id (for pages using <form>). */
  formId?: string;
}

export function UnsavedChangesBar({
  visible,
  onDiscard,
  onSave,
  saving = false,
  saveLabel = "Save changes",
  description = DEFAULT_DESCRIPTION,
  formId,
}: Readonly<UnsavedChangesBarProps>) {
  if (!visible) return null;

  const savingText =
    saving && !saveLabel.endsWith("...") ? `${saveLabel}...` : saveLabel;

  return (
    <section
      className="sticky bottom-0 z-40 mt-6 px-1 pb-1"
      aria-live="polite"
      aria-label="Unsaved changes"
    >
      <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-4 rounded-xl border border-gray-200 border-l-4 border-l-[#E46619] bg-card-background bg-gradient-to-br from-[#E46619]/[0.08] via-card-background to-card-background px-4 py-4 text-center shadow-[0_8px_28px_-6px_rgba(0,0,0,0.14)] ring-1 ring-[#E46619]/20 sm:flex-row sm:items-center sm:justify-between sm:text-left sm:px-6 md:py-5">
        <div className="min-w-0 w-full sm:w-auto">
          <p className="text-sm font-semibold text-primary md:text-base">
            Unsaved changes
          </p>
          <p className="mt-0.5 text-xs text-tertiary md:text-sm">{description}</p>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-center gap-3 sm:w-auto sm:justify-end">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="rounded-xl border border-gray-200 bg-card-background px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm cursor-pointer"
          >
            Discard
          </button>
          <button
            type={formId ? "submit" : "button"}
            form={formId}
            onClick={formId ? undefined : onSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm cursor-pointer"
            style={{ backgroundColor: UNSAVED_BAR_ACCENT }}
          >
            {saving ? (
              savingText
            ) : (
              <>
                <FiSave className="h-4 w-4 shrink-0" aria-hidden />
                {saveLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
