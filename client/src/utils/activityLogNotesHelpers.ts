import type { ActivityLogOrderNoteHistoryEntry, ActivityLogOrderNote, ActivityLogRow } from "../types/activityLog.types";

export const ACTIVITY_LOG_NOTES_PREVIEW_MAX_LENGTH = 40;

export function truncateActivityLogNotePreview(note: string | null | undefined): string | null {
  if (note == null) return null;
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= ACTIVITY_LOG_NOTES_PREVIEW_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, ACTIVITY_LOG_NOTES_PREVIEW_MAX_LENGTH)}…`;
}

/** Newest history entries first for display. */
export function sortActivityLogNoteHistoryNewestFirst(
  history: ActivityLogOrderNoteHistoryEntry[],
): ActivityLogOrderNoteHistoryEntry[] {
  return [...history].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function formatActivityLogNoteHistoryLabel(
  entry: ActivityLogOrderNoteHistoryEntry,
  displayTimezone: string,
): string {
  const when = new Date(entry.updatedAt).toLocaleString("en-US", {
    timeZone: displayTimezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const who =
    entry.source === "square"
      ? `${entry.updatedByName} (imported)`
      : `${entry.updatedByName} · ${entry.updatedByRole}`;
  return `${when} — ${who}`;
}

export function formatActivityLogCurrentNoteCreatedLabel(
  note: Pick<
    ActivityLogOrderNote,
    | "currentNoteCreatedAt"
    | "currentNoteCreatedByName"
    | "currentNoteCreatedByRole"
    | "currentNoteSource"
  >,
  displayTimezone: string,
): string | null {
  if (!note.currentNoteCreatedAt) return null;

  const when = new Date(note.currentNoteCreatedAt).toLocaleString("en-US", {
    timeZone: displayTimezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (note.currentNoteSource === "square") {
    return `${when} — Square POS (imported)`;
  }

  const name = note.currentNoteCreatedByName?.trim() || "Unknown";
  const role = note.currentNoteCreatedByRole?.trim() || "—";
  return `${when} — ${name} · ${role}`;
}

export function resolveActivityLogRowLocationId(
  row: { locationId?: string },
  fallbackLocationId: string | null,
): string | null {
  return row.locationId ?? fallbackLocationId;
}

export function getActivityLogNoteDisplayText(
  row: Pick<ActivityLogRow, "hasNotes" | "notesPreview"> | null | undefined,
): string {
  if (row?.hasNotes && row.notesPreview?.trim()) {
    return row.notesPreview.trim();
  }
  return "—";
}
