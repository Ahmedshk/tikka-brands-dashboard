import { Agenda } from "agenda";
import { MongoBackend } from "@agendajs/mongo-backend";
import { logger } from "../utils/logger.util.js";
import { isTestMode } from "../utils/reviewTimings.js";

let agenda: Agenda | null = null;

export function getAgenda(): Agenda {
  if (!agenda) throw new Error("Agenda has not been initialized");
  return agenda;
}

export async function initializeAgenda(): Promise<Agenda> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not defined");

  const backend = new MongoBackend({
    address: mongoUri,
    collection: "agendaJobs",
  });

  agenda = new Agenda({
    backend,
    processEvery: isTestMode() ? "15 seconds" : "1 minute",
    maxConcurrency: 5,
    defaultConcurrency: 1,
  });

  agenda.on("ready", () => logger.info("Agenda: connected and ready"));
  agenda.on("error", (err) => logger.error("Agenda: error", err));

  // Import and register job definitions
  const { registerReviewCycleJobs } = await import("../jobs/reviewCycle.jobs.js");
  registerReviewCycleJobs(agenda);

  await agenda.start();
  logger.info("Agenda: scheduler started");

  const schedule = isTestMode() ? "*/15 * * * * *" : "0 6 * * *";
  if (isTestMode()) logger.info("Agenda: REVIEW_TEST_MODE enabled — running jobs every 15 seconds");

  await agenda.every(schedule, "review:check-milestones");
  await agenda.every(schedule, "review:check-manager-deadline");
  await agenda.every(schedule, "review:check-director-deadline");
  await agenda.every(schedule, "review:check-sharing-deadline");
  await agenda.every(schedule, "review:check-checkin-deadlines");
  await agenda.every(schedule, "review:supersede-scheduled");

  return agenda;
}

export async function shutdownAgenda(): Promise<void> {
  if (agenda) {
    await agenda.stop();
    logger.info("Agenda: scheduler stopped");
  }
}
