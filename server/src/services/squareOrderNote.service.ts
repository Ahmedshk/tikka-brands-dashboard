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
import { getSquareOrderCreatedAtMsFromRaw } from "../utils/squareOrderCacheHelpers.js";
import { extractSquareOrderNote } from "../utils/squareOrderNote.util.js";

function formatActorName(firstName?: string | null, lastName?: string | null): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim() || "Unknown";
}

function orderCreatedAtFromMongoOrder(order: {
  squareCreatedAt?: Date | null;
  raw?: unknown;
}): Date | null {
  if (order.squareCreatedAt instanceof Date && !Number.isNaN(order.squareCreatedAt.getTime())) {
    return order.squareCreatedAt;
  }
  if (order.raw != null && typeof order.raw === "object" && !Array.isArray(order.raw)) {
    const ms = getSquareOrderCreatedAtMsFromRaw(order.raw as Record<string, unknown>);
    if (ms != null) return new Date(ms);
  }
  return null;
}

function historyEntryToDto(
  entry: SquareOrderNoteHistoryEntry,
  orderCreatedAt: Date | null,
): SquareOrderNoteHistoryEntryDto {
  const displayAt =
    entry.source === "square" && orderCreatedAt != null ? orderCreatedAt : entry.updatedAt;
  return {
    note: entry.note,
    updatedAt: displayAt.toISOString(),
    ...(entry.updatedByUserId ? { updatedByUserId: entry.updatedByUserId.toString() } : {}),
    updatedByName: entry.updatedByName,
    updatedByRole: entry.updatedByRole,
    source: entry.source,
  };
}

function currentNoteAuthoredAt(doc: {
  currentNoteSetAt?: Date | null;
  createdAt?: Date;
}): Date {
  if (doc.currentNoteSetAt instanceof Date && !Number.isNaN(doc.currentNoteSetAt.getTime())) {
    return doc.currentNoteSetAt;
  }
  if (doc.createdAt instanceof Date && !Number.isNaN(doc.createdAt.getTime())) {
    return doc.createdAt;
  }
  return new Date();
}

function dashboardHistoryEntryFromCurrentNote(
  doc: {
    currentNote: string;
    currentNoteSetAt?: Date | null;
    currentNoteSetByUserId?: Types.ObjectId;
    currentNoteSetByName?: string;
    currentNoteSetByRole?: string;
    createdAt?: Date;
  },
): SquareOrderNoteHistoryEntry {
  return {
    note: doc.currentNote,
    updatedAt: currentNoteAuthoredAt(doc),
    ...(doc.currentNoteSetByUserId ? { updatedByUserId: doc.currentNoteSetByUserId } : {}),
    updatedByName: doc.currentNoteSetByName?.trim() || "Unknown",
    updatedByRole: doc.currentNoteSetByRole?.trim() || "—",
    source: "dashboard",
  };
}

function applyCurrentNoteAuthor(
  doc: {
    currentNoteSetAt?: Date;
    currentNoteSetByUserId?: Types.ObjectId;
    currentNoteSetByName?: string;
    currentNoteSetByRole?: string;
  },
  actorUserId: string,
  actorName: string,
  actorRole: string,
  at: Date,
): void {
  doc.currentNoteSetAt = at;
  doc.currentNoteSetByUserId = new Types.ObjectId(actorUserId);
  doc.currentNoteSetByName = actorName;
  doc.currentNoteSetByRole = actorRole;
}

type SquareOrderNoteDocShape = {
  currentNote: string;
  currentNoteSetAt?: Date | null;
  currentNoteSetByUserId?: Types.ObjectId;
  currentNoteSetByName?: string;
  currentNoteSetByRole?: string;
  createdAt?: Date;
  history: SquareOrderNoteHistoryEntry[];
};

function currentNoteCreatedMeta(args: {
  doc: SquareOrderNoteDocShape | null;
  currentNote: string;
  squareSeedNote: string | null;
  orderCreatedAt: Date | null;
}): Pick<
  SquareOrderNoteDto,
  "currentNoteCreatedAt" | "currentNoteCreatedByName" | "currentNoteCreatedByRole" | "currentNoteSource"
> {
  const trimmed = args.currentNote.trim();
  if (!trimmed) {
    return { currentNoteCreatedAt: null };
  }

  if (args.doc) {
    return {
      currentNoteCreatedAt: currentNoteAuthoredAt(args.doc).toISOString(),
      currentNoteCreatedByName: args.doc.currentNoteSetByName?.trim() || "Unknown",
      currentNoteCreatedByRole: args.doc.currentNoteSetByRole?.trim() || "—",
      currentNoteSource: "dashboard",
    };
  }

  const seed = args.squareSeedNote?.trim();
  if (seed && trimmed === seed && args.orderCreatedAt != null) {
    return {
      currentNoteCreatedAt: args.orderCreatedAt.toISOString(),
      currentNoteCreatedByName: "Square POS",
      currentNoteCreatedByRole: "—",
      currentNoteSource: "square",
    };
  }

  return { currentNoteCreatedAt: null };
}

function toSquareOrderNoteDto(args: {
  squareOrderId: string;
  locationId: string;
  doc: SquareOrderNoteDocShape | null;
  orderContext: { seedNote: string | null; orderCreatedAt: Date | null };
  currentNote?: string;
}): SquareOrderNoteDto {
  const { squareOrderId, locationId, doc, orderContext } = args;
  const currentNote = args.currentNote ?? doc?.currentNote ?? orderContext.seedNote ?? "";
  const { seedNote: squareSeedNote, orderCreatedAt } = orderContext;

  return {
    squareOrderId,
    locationId,
    currentNote,
    squareSeedNote,
    ...currentNoteCreatedMeta({
      doc,
      currentNote,
      squareSeedNote,
      orderCreatedAt,
    }),
    history: (doc?.history ?? []).map((entry) => historyEntryToDto(entry, orderCreatedAt)),
  };
}

async function loadSquareOrderNoteContext(
  locationId: string,
  squareOrderId: string,
): Promise<{ seedNote: string | null; orderCreatedAt: Date | null }> {
  const order = await SquareOrderModel.findOne({
    squareId: squareOrderId,
    locationId: new Types.ObjectId(locationId),
  })
    .select("raw squareCreatedAt")
    .lean();
  if (!order) {
    return { seedNote: null, orderCreatedAt: null };
  }
  const seedNote = order.raw != null ? extractSquareOrderNote(order.raw) : null;
  return {
    seedNote,
    orderCreatedAt: orderCreatedAtFromMongoOrder(order),
  };
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
    const [doc, orderContext] = await Promise.all([
      SquareOrderNoteModel.findOne({
        squareOrderId,
        locationId: new Types.ObjectId(locationId),
      }).lean(),
      loadSquareOrderNoteContext(locationId, squareOrderId),
    ]);
    const { seedNote: squareSeedNote, orderCreatedAt } = orderContext;

    return toSquareOrderNoteDto({
      squareOrderId,
      locationId,
      doc: doc ?? null,
      orderContext: { seedNote: squareSeedNote, orderCreatedAt },
      ...(doc ? {} : { currentNote: squareSeedNote ?? "" }),
    });
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
        const orderContext = await loadSquareOrderNoteContext(locationId, squareOrderId);
        return toSquareOrderNoteDto({
          squareOrderId,
          locationId,
          doc: existing,
          orderContext: {
            seedNote: orderContext.seedNote,
            orderCreatedAt: orderContext.orderCreatedAt,
          },
        });
      }

      existing.history.push(dashboardHistoryEntryFromCurrentNote(existing));
      existing.currentNote = trimmedNote;
      applyCurrentNoteAuthor(existing, actorUserId, actorName, actorRole, now);
      await existing.save();

      const orderContext = await loadSquareOrderNoteContext(locationId, squareOrderId);
      return toSquareOrderNoteDto({
        squareOrderId,
        locationId,
        doc: existing,
        orderContext: {
          seedNote: orderContext.seedNote,
          orderCreatedAt: orderContext.orderCreatedAt,
        },
      });
    }

    const orderContext = await loadSquareOrderNoteContext(locationId, squareOrderId);
    const { seedNote: squareSeedNote, orderCreatedAt } = orderContext;
    const history: SquareOrderNoteHistoryEntry[] = [];

    if (squareSeedNote != null && squareSeedNote !== trimmedNote) {
      history.push({
        note: squareSeedNote,
        updatedAt: orderCreatedAt ?? now,
        updatedByName: "Square POS",
        updatedByRole: "—",
        source: "square",
      });
    }

    const created = await SquareOrderNoteModel.create({
      squareOrderId,
      locationId: new Types.ObjectId(locationId),
      currentNote: trimmedNote,
      currentNoteSetAt: now,
      currentNoteSetByUserId: new Types.ObjectId(actorUserId),
      currentNoteSetByName: actorName,
      currentNoteSetByRole: actorRole,
      history,
    });

    return toSquareOrderNoteDto({
      squareOrderId,
      locationId,
      doc: created,
      orderContext: { seedNote: squareSeedNote, orderCreatedAt },
    });
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
