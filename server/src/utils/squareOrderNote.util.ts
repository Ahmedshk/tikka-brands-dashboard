const ORDER_LEVEL_NOTE_KEYS = ["note", "customer_note", "seller_note"] as const;

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function lineItemNotesFromRaw(raw: Record<string, unknown>): string[] {
  const lineItems = raw.line_items;
  if (!Array.isArray(lineItems)) return [];

  const notes: string[] = [];
  for (const item of lineItems) {
    if (item == null || typeof item !== "object") continue;
    const note = readTrimmedString((item as Record<string, unknown>).note);
    if (note) notes.push(note);
  }
  return notes;
}

/**
 * Best-effort extraction of an order-level note from a cached Square order `raw` payload.
 * Checks order-level fields first, then unique non-empty `line_items[].note` values.
 */
export function extractSquareOrderNote(raw: unknown): string | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const payload = raw as Record<string, unknown>;
  for (const key of ORDER_LEVEL_NOTE_KEYS) {
    const orderLevel = readTrimmedString(payload[key]);
    if (orderLevel) return orderLevel;
  }

  const lineNotes = lineItemNotesFromRaw(payload);
  if (lineNotes.length === 0) return null;

  const unique = [...new Set(lineNotes)];
  return unique.join("\n");
}

export const NOTES_PREVIEW_MAX_LENGTH = 40;

export function truncateNotePreview(note: string | null | undefined): string | null {
  if (note == null) return null;
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= NOTES_PREVIEW_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, NOTES_PREVIEW_MAX_LENGTH)}…`;
}
