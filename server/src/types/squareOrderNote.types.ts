export type SquareOrderNoteHistorySource = "dashboard" | "square";

export interface SquareOrderNoteHistoryEntryDto {
  note: string;
  updatedAt: string;
  updatedByUserId?: string;
  updatedByName: string;
  updatedByRole: string;
  source: SquareOrderNoteHistorySource;
}

export interface SquareOrderNoteDto {
  squareOrderId: string;
  locationId: string;
  currentNote: string;
  squareSeedNote: string | null;
  /** When the displayed current note was authored (dashboard save or Square order time). */
  currentNoteCreatedAt: string | null;
  currentNoteCreatedByName?: string;
  currentNoteCreatedByRole?: string;
  currentNoteSource?: SquareOrderNoteHistorySource;
  history: SquareOrderNoteHistoryEntryDto[];
}

export interface SquareOrderNotePreviewDto {
  notesPreview: string | null;
  hasNotes: boolean;
}
