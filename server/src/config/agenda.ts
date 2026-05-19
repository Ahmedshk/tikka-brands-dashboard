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
    // Shorter poll so one-shot calendar notification jobs are picked up within ~30s.
    processEvery: isTestMode() ? "15 seconds" : "30 seconds",
    maxConcurrency: 5,
    defaultConcurrency: 1,
  });

  agenda.on("ready", () => logger.info("Agenda: connected and ready"));
  agenda.on("error", (err) => logger.error("Agenda: error", err));

  // Import and register job definitions
  const { registerReviewCycleJobs } = await import("../jobs/reviewCycle.jobs.js");
  registerReviewCycleJobs(agenda);

  const { registerDisciplinaryJobs } = await import("../jobs/disciplinary.jobs.js");
  registerDisciplinaryJobs(agenda);

  const { registerCalendarJobs, queueCalendarNotificationBackfill } = await import(
    "../jobs/calendar.jobs.js"
  );
  registerCalendarJobs(agenda);

  const {
    registerIntegrationJobs,
    runCatchUpMarketManValidCountDatesIfMissedToday,
  } = await import("../jobs/integration.jobs.js");
  registerIntegrationJobs(agenda);

  const { registerAlertJobs, bootstrapAlertAgendaSchedule } = await import("../jobs/alerts.jobs.js");
  registerAlertJobs(agenda);

  const { registerDashboardCacheJobs, DASHBOARD_CACHE_REFRESH_JOB_NAME } = await import(
    "../jobs/dashboardCache.jobs.js"
  );
  registerDashboardCacheJobs(agenda);

  await agenda.start();
  logger.info("Agenda: scheduler started");

  void runCatchUpMarketManValidCountDatesIfMissedToday();

  const schedule = isTestMode() ? "*/15 * * * * *" : "0 6 * * *";
  if (isTestMode()) logger.info("Agenda: REVIEW_TEST_MODE enabled — running jobs every 15 seconds");

  await agenda.every(schedule, "review:check-milestones");
  await agenda.every(schedule, "review:check-manager-deadline");
  await agenda.every(schedule, "review:check-director-deadline");
  await agenda.every(schedule, "review:check-sharing-deadline");
  await agenda.every(schedule, "review:check-checkin-deadlines");
  await agenda.every(schedule, "review:supersede-scheduled");

  // Disciplinary rolling period expiry check (daily at midnight)
  await agenda.every("0 0 * * *", "disciplinary:check-expiry");

  await agenda.every(isTestMode() ? "*/1 * * * * *" : "*/15 * * * *", "calendar:reconcile");

  await agenda.every(
    isTestMode() ? "*/2 * * * *" : "*/15 * * * *",
    "integration:poll-15m",
  );

  /** Square catalog full sync once per UTC day (~3–5am MT depending on DST). Deduped by Denver calendar date in the job. */
  await agenda.every(
    isTestMode() ? "*/3 * * * *" : "0 10 * * *",
    "integration:catalog-daily",
  );

  /**
   * Dashboard response cache: refresh every 15 minutes via the cron, and
   * queue an immediate one-shot run at startup so the first user request
   * after deploy is a cache hit instead of a slow live compute.
   */
  await agenda.every(
    isTestMode() ? "*/2 * * * *" : "*/15 * * * *",
    DASHBOARD_CACHE_REFRESH_JOB_NAME,
  );
  await agenda.now(DASHBOARD_CACHE_REFRESH_JOB_NAME, {});
  if (process.env.SKIP_CALENDAR_STARTUP_BACKFILL !== "1") {
    queueCalendarNotificationBackfill(agenda);
  }

  await bootstrapAlertAgendaSchedule(agenda);

  return agenda;
}

export async function shutdownAgenda(): Promise<void> {
  if (agenda) {
    await agenda.stop();
    logger.info("Agenda: scheduler stopped");
  }
}
