import { CalendarEventModel } from "../models/calendarEvent.model.js";
import { IntegratedGoogleCalendarModel } from "../models/integratedGoogleCalendar.model.js";
import { logger } from "./logger.util.js";

/**
 * Idempotent startup: seed integration from GOOGLE_CALENDAR_ID, backfill events,
 * drop legacy unique index on googleEventId, sync compound indexes.
 */
export async function bootstrapGoogleCalendarIntegrations(): Promise<void> {
  const envId = process.env.GOOGLE_CALENDAR_ID?.trim();
  const integrationCount = await IntegratedGoogleCalendarModel.countDocuments();
  if (integrationCount === 0 && envId) {
    await IntegratedGoogleCalendarModel.create({
      name: "Primary calendar",
      googleCalendarId: envId,
      description: "Primary calendar (from server configuration)",
    });
    logger.info("Seeded IntegratedGoogleCalendar from GOOGLE_CALENDAR_ID");
  }

  // Backfill missing calendar names for existing integration docs.
  const missingName = await IntegratedGoogleCalendarModel.find({
    $or: [{ name: { $exists: false } }, { name: null }, { name: "" }],
  })
    .select("_id description googleCalendarId")
    .lean();
  if (missingName.length > 0) {
    const ops = missingName.map((d) => {
      const description = (d.description ?? "").trim();
      const googleCalendarId = (d.googleCalendarId ?? "").trim();
      const name = description || googleCalendarId || "Calendar";
      return {
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { name } },
        },
      };
    });
    await IntegratedGoogleCalendarModel.bulkWrite(ops);
    logger.info("Backfilled name on IntegratedGoogleCalendar documents", { modified: ops.length });
  }

  const firstIntegration = await IntegratedGoogleCalendarModel.findOne().sort({ createdAt: 1 }).lean();
  const calendarIdForBackfill = envId ?? firstIntegration?.googleCalendarId;

  if (calendarIdForBackfill) {
    const res = await CalendarEventModel.updateMany(
      {
        $or: [
          { googleCalendarId: { $exists: false } },
          { googleCalendarId: null },
          { googleCalendarId: "" },
        ],
      },
      { $set: { googleCalendarId: calendarIdForBackfill } },
    );
    if (res.modifiedCount > 0) {
      logger.info("Backfilled googleCalendarId on calendar events", { modified: res.modifiedCount });
    }
  } else {
    const orphanCount = await CalendarEventModel.countDocuments({
      $or: [
        { googleCalendarId: { $exists: false } },
        { googleCalendarId: null },
        { googleCalendarId: "" },
      ],
    });
    if (orphanCount > 0) {
      logger.warn(
        "Calendar events exist without googleCalendarId and no GOOGLE_CALENDAR_ID / integrations to backfill from",
        { orphanCount },
      );
    }
  }

  try {
    await CalendarEventModel.collection.dropIndex("googleEventId_1");
    logger.info("Dropped legacy index googleEventId_1 on calendarevents");
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code;
    const msg = (e as { message?: string })?.message ?? "";
    if (code !== 27 && !msg.includes("index not found") && !msg.includes("can't find index")) {
      logger.warn("Legacy googleEventId index drop skipped or failed", { code, msg });
    }
  }

  try {
    await CalendarEventModel.syncIndexes();
  } catch (e) {
    logger.error("CalendarEventModel.syncIndexes failed", e);
    throw e;
  }
}
