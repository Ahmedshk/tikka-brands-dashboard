/**
 * One-shot: cancel+reschedule Agenda calendar:notify-one jobs for future events in the
 * scheduling horizon. Run after deploy when switching from polling to scheduled notifications.
 *
 * Initializes Agenda (set SKIP_CALENDAR_STARTUP_BACKFILL=1 to avoid duplicating server startup backfill).
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "../config/database.js";
import { initializeAgenda, shutdownAgenda } from "../config/agenda.js";
import { backfillAllFutureNotificationJobs } from "../utils/calendarNotificationSchedule.util.js";
import { logger } from "../utils/logger.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

async function main(): Promise<void> {
  try {
    process.env.SKIP_CALENDAR_STARTUP_BACKFILL = "1";
    await connectDatabase();
    await initializeAgenda();
    const { eventsProcessed, jobsScheduled } = await backfillAllFutureNotificationJobs();
    logger.info("Backfill calendar notification jobs complete", { eventsProcessed, jobsScheduled });
    console.log("\n✅ Backfill complete.", { eventsProcessed, jobsScheduled }, "\n");
    await shutdownAgenda();
    process.exit(0);
  } catch (error) {
    logger.error("Backfill calendar notification jobs failed", error);
    console.error("\n❌ Backfill failed:", error);
    try {
      await shutdownAgenda();
    } catch {
      /* ignore */
    }
    process.exit(1);
  }
}

void main();
