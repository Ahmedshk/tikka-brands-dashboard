import { Types } from "mongoose";
import { SquareOrderModel } from "../models/squareOrder.model.js";
import {
  SquareOrderNoteModel,
  type SquareOrderNoteHistoryEntry,
} from "../models/squareOrderNote.model.js";
import { UserModel } from "../models/user.model.js";
import type {
  SquareOrderNoteDto,
  SquareOrderNoteHistoryEntryDto,
  SquareOrderNotePreviewDto,
} from "../types/squareOrderNote.types.js";
import { NotFoundError, ValidationError } from "../utils/errors.util.js";
import { extractSquareOrderNote } from "../utils/squareOrderNote.util.js";

function formatActorName(firstName?: string | null, lastName?: string | null): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim() || "Unknown";
}

function historyEntryToDto(entry: SquareOrderNoteHistoryEntry): SquareOrderNoteHistoryEntryDto {
  return {
    note: entry.note,
    updatedAt: entry.updatedAt.toISOString(),
    ...(entry.updatedByUserId ? { updatedByUserId: entry.updatedByUserId.toString() } : {}),
    updatedByName: entry.updatedByName,
    updatedByRole: entry.updatedByRole,
    source: entry.source,
  };
}

async function loadSquareSeedNote(
  locationId: string,
  squareOrderId: string,
): Promise<string | null> {
  const order = await SquareOrderModel.findOne({
    squareId: squareOrderId,
    locationId: new Types.ObjectId(locationId),
  })
    .select("raw")
    .lean();
  if (!order?.raw) return null;
  return extractSquareOrderNote(order.raw);
}

async function loadSquareSeedNotesBatch(
  locationId: string,
  squareOrderIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (squareOrderIds.length === 0) return result;

  const orders = await SquareOrderModel.find({
    squareId: { $in: squareOrderIds },
    locationId: new Types.ObjectId(locationId),
  })
    .select("squareId raw")
    .lean();

  const found = new Set<string>();
  for (const order of orders) {
    const seed = extractSquareOrderNote(order.raw);
    result.set(order.squareId, seed);
    found.add(order.squareId);
  }

  for (const id of squareOrderIds) {
    if (!found.has(id)) result.set(id, null);
  }
  return result;
}

function effectiveNote(
  dashboardNote: string | undefined,
  hasDashboardDoc: boolean,
  squareSeed: string | null,
): string {
  if (hasDashboardDoc) return dashboardNote ?? "";
  return squareSeed ?? "";
}

export class SquareOrderNoteService {
  async getNoteForOrder(locationId: string, squareOrderId: string): Promise<SquareOrderNoteDto> {
    const [doc, squareSeedNote] = await Promise.all([
      SquareOrderNoteModel.findOne({
        squareOrderId,
        locationId: new Types.ObjectId(locationId),
      }).lean(),
      loadSquareSeedNote(locationId, squareOrderId),
    ]);

    if (doc) {
      return {
        squareOrderId,
        locationId,
        currentNote: doc.currentNote,
        squareSeedNote,
        history: doc.history.map(historyEntryToDto),
      };
    }

    return {
      squareOrderId,
      locationId,
      currentNote: squareSeedNote ?? "",
      squareSeedNote,
      history: [],
    };
  }

  async getNotesPreviewForOrders(
    locationId: string,
    squareOrderIds: string[],
  ): Promise<Map<string, SquareOrderNotePreviewDto>> {
    const uniqueIds = [...new Set(squareOrderIds.filter((id) => id.length > 0))];
    const previews = new Map<string, SquareOrderNotePreviewDto>();
    if (uniqueIds.length === 0) return previews;

    const locationObjectId = new Types.ObjectId(locationId);
    const [docs, squareSeeds] = await Promise.all([
      SquareOrderNoteModel.find({
        locationId: locationObjectId,
        squareOrderId: { $in: uniqueIds },
      })
        .select("squareOrderId currentNote")
        .lean(),
      loadSquareSeedNotesBatch(locationId, uniqueIds),
    ]);

    const docByOrderId = new Map(docs.map((doc) => [doc.squareOrderId, doc]));

    for (const squareOrderId of uniqueIds) {
      const doc = docByOrderId.get(squareOrderId);
      const squareSeed = squareSeeds.get(squareOrderId) ?? null;
      const note = effectiveNote(doc?.currentNote, Boolean(doc), squareSeed);
      const trimmed = note.trim();
      previews.set(squareOrderId, {
        notesPreview: trimmed.length > 0 ? trimmed : null,
        hasNotes: trimmed.length > 0,
      });
    }

    return previews;
  }

  async upsertNote(
    locationId: string,
    squareOrderId: string,
    note: string,
    actorUserId: string,
  ): Promise<SquareOrderNoteDto> {
    const trimmedNote = note.trim();
    const actor = await UserModel.findById(actorUserId)
      .select("firstName lastName role")
      .lean();
    if (!actor) {
      throw new NotFoundError("User not found.");
    }

    const actorName = formatActorName(actor.firstName, actor.lastName);
    const actorRole = actor.role?.trim() || "—";
    const now = new Date();

    const existing = await SquareOrderNoteModel.findOne({
      squareOrderId,
      locationId: new Types.ObjectId(locationId),
    });

    if (existing) {
      if (existing.currentNote === trimmedNote) {
        const squareSeedNote = await loadSquareSeedNote(locationId, squareOrderId);
        return {
          squareOrderId,
          locationId,
          currentNote: existing.currentNote,
          squareSeedNote,
          history: existing.history.map(historyEntryToDto),
        };
      }

      existing.history.push({
        note: existing.currentNote,
        updatedAt: now,
        updatedByUserId: new Types.ObjectId(actorUserId),
        updatedByName: actorName,
        updatedByRole: actorRole,
        source: "dashboard",
      });
      existing.currentNote = trimmedNote;
      await existing.save();

      const squareSeedNote = await loadSquareSeedNote(locationId, squareOrderId);
      return {
        squareOrderId,
        locationId,
        currentNote: existing.currentNote,
        squareSeedNote,
        history: existing.history.map(historyEntryToDto),
      };
    }

    const squareSeedNote = await loadSquareSeedNote(locationId, squareOrderId);
    const history: SquareOrderNoteHistoryEntry[] = [];

    if (squareSeedNote != null && squareSeedNote !== trimmedNote) {
      history.push({
        note: squareSeedNote,
        updatedAt: now,
        updatedByName: "Square POS",
        updatedByRole: "—",
        source: "square",
      });
    }

    const created = await SquareOrderNoteModel.create({
      squareOrderId,
      locationId: new Types.ObjectId(locationId),
      currentNote: trimmedNote,
      history,
    });

    return {
      squareOrderId,
      locationId,
      currentNote: created.currentNote,
      squareSeedNote,
      history: created.history.map(historyEntryToDto),
    };
  }
}

export async function assertSquareOrderExistsForLocation(
  locationId: string,
  squareOrderId: string,
): Promise<void> {
  const exists = await SquareOrderModel.exists({
    squareId: squareOrderId,
    locationId: new Types.ObjectId(locationId),
  });
  if (!exists) {
    throw new ValidationError("Order not found for this location.");
  }
}
