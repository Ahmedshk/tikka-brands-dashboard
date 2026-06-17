import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { activityLogService } from "../../services/activityLog.service";
import type { ActivityLogOrderNote, ActivityLogRow } from "../../types/activityLog.types";
import {
  formatActivityLogCurrentNoteCreatedLabel,
  formatActivityLogNoteHistoryLabel,
  sortActivityLogNoteHistoryNewestFirst,
} from "../../utils/activityLogNotesHelpers";
import { Spinner } from "../common/Spinner";

interface ActivityLogNotesModalProps {
  open: boolean;
  row: ActivityLogRow | null;
  locationId: string | null;
  displayTimezone: string;
  onClose: () => void;
  onSaved: (squareOrderId: string, preview: string | null, hasNotes: boolean) => void;
}

export const ActivityLogNotesModal = ({
  open,
  row,
  locationId,
  displayTimezone,
  onClose,
  onSaved,
}: ActivityLogNotesModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteData, setNoteData] = useState<ActivityLogOrderNote | null>(null);
  const [draftNote, setDraftNote] = useState("");

  const effectiveLocationId = row?.locationId ?? locationId;
  const squareOrderId = row?.squareOrderId ?? null;

  const loadNote = useCallback(async () => {
    if (!open || !squareOrderId || !effectiveLocationId) return;
    setLoading(true);
    try {
      const data = await activityLogService.getOrderNote(effectiveLocationId, squareOrderId);
      setNoteData(data);
      setDraftNote(data.currentNote);
    } catch {
      toast.error("Failed to load note.");
      setNoteData(null);
      setDraftNote("");
    } finally {
      setLoading(false);
    }
  }, [open, squareOrderId, effectiveLocationId]);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      void loadNote();
      return;
    }
    dialogRef.current?.close();
    setNoteData(null);
    setDraftNote("");
  }, [open, loadNote]);

  const handleSave = async () => {
    if (!squareOrderId || !effectiveLocationId) return;
    setSaving(true);
    try {
      const data = await activityLogService.updateOrderNote(
        effectiveLocationId,
        squareOrderId,
        draftNote,
      );
      const trimmedNote = data.currentNote.trim();
      onSaved(
        squareOrderId,
        trimmedNote.length > 0 ? trimmedNote : null,
        trimmedNote.length > 0,
      );
      toast.success("Note saved.");
      dialogRef.current?.close();
      onClose();
    } catch {
      toast.error("Failed to save note.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const sortedHistory = sortActivityLogNoteHistoryNewestFirst(noteData?.history ?? []);
  const hasUnsavedChanges = noteData != null && draftNote !== noteData.currentNote;
  const currentNoteCreatedLabel =
    noteData != null ? formatActivityLogCurrentNoteCreatedLabel(noteData, displayTimezone) : null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center border-0 bg-transparent p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="activity-log-notes-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-lg">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>

        <div className="relative max-h-[90vh] flex flex-col bg-primary text-primary rounded-xl shadow-lg border-b border-gray-200 overflow-hidden min-w-0">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2
              id="activity-log-notes-title"
              className="text-sm md:text-base 2xl:text-lg font-semibold text-white"
            >
              Order Notes
            </h2>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 bg-card-background text-primary">
            {row && (
              <p className="text-sm text-secondary break-words">{row.name}</p>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8">
                <Spinner size="lg" className="text-button-primary" />
                <span className="text-sm text-secondary">Loading note…</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div>
                    <label htmlFor="activity-log-note-input" className="text-sm font-semibold text-primary">
                      Current note
                    </label>
                    {currentNoteCreatedLabel && (
                      <p className="mt-1 text-xs text-secondary">{currentNoteCreatedLabel}</p>
                    )}
                  </div>
                  <textarea
                    id="activity-log-note-input"
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="Add a note for this order…"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-primary bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y min-h-[96px]"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-secondary">{draftNote.length}/2000</span>
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving || !hasUnsavedChanges}
                      className="px-4 py-1.5 rounded-lg bg-button-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <h3 className="text-sm font-semibold text-primary">Edit history</h3>
                  {sortedHistory.length === 0 ? (
                    <p className="text-sm text-secondary">No previous versions yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {sortedHistory.map((entry, index) => (
                        <details
                          key={`note-history-${entry.updatedAt}-${index}`}
                          className="border border-gray-200 rounded-lg p-3 bg-white"
                        >
                          <summary className="text-xs font-medium text-secondary cursor-pointer">
                            {formatActivityLogNoteHistoryLabel(entry, displayTimezone)}
                          </summary>
                          <p className="mt-2 text-sm text-primary whitespace-pre-wrap break-words">
                            {entry.note || "—"}
                          </p>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};
