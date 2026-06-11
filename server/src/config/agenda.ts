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
    runCatchUpMarketManOrdersMonthWindowIfMissedToday,
    INTEGRATION_MARKETMAN_ORDERS_MONTHLY_DAILY_JOB,
  } = await import("../jobs/integration.jobs.js");
  registerIntegrationJobs(agenda);

  const { registerAlertJobs, bootstrapAlertAgendaSchedule } = await import("../jobs/alerts.jobs.js");
  registerAlertJobs(agenda);

  const {
    registerGoogleBusinessReviewJobs,
    bootstrapGoogleBusinessReviewAgendaSchedule,
  } = await import("../jobs/googleBusinessReviews.jobs.js");
  registerGoogleBusinessReviewJobs(agenda);

  const { registerDashboardCacheJobs, DASHBOARD_CACHE_REFRESH_JOB_NAME } = await import(
    "../jobs/dashboardCache.jobs.js"
  );
  registerDashboardCacheJobs(agenda);

  await agenda.start();
  logger.info("Agenda: scheduler started");

  void runCatchUpMarketManValidCountDatesIfMissedToday();
  void runCatchUpMarketManOrdersMonthWindowIfMissedToday();

  const schedule = isTestMode() ? "*/15 * * * * *" : "0 9 * * *";
  const reviewOpts = isTestMode() ? undefined : { timezone: "America/Denver" };
  if (isTestMode()) logger.info("Agenda: REVIEW_TEST_MODE enabled — running jobs every 15 seconds");

  await agenda.every(schedule, "review:check-milestones", undefined, reviewOpts);
  await agenda.every(schedule, "review:check-manager-deadline", undefined, reviewOpts);
  await agenda.every(schedule, "review:check-director-deadline", undefined, reviewOpts);
  await agenda.every(schedule, "review:check-sharing-deadline", undefined, reviewOpts);
  await agenda.every(schedule, "review:check-checkin-deadlines", undefined, reviewOpts);
  await agenda.every(schedule, "review:supersede-scheduled", undefined, reviewOpts);

  await agenda.every("30 9 * * *", "disciplinary:check-expiry", undefined, {
    timezone: "America/Denver",
  });

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

  /** MarketMan orders (sent + delivery) month-window backfill daily at 3 AM MT. */
  if (!isTestMode()) {
    await agenda.every(
      "0 3 * * *",
      INTEGRATION_MARKETMAN_ORDERS_MONTHLY_DAILY_JOB,
      undefined,
      { timezone: "America/Denver" },
    );
  }

  /**
   * Dashboard response cache: refresh every 15 minutes via the cron, and
   * queue an immediate one-shot run at startup so the first user request
   * after deploy is a cache hit instead of a slow live compute.
   *
   * Staggered by 7 minutes from `integration:poll-15m` (both 15-min cadence)
   * so they don't hit Mongo concurrently — past experiments showed that
   * collision caused the cache cycle to take ~6 minutes and froze the site
   * every 15 minutes (see comments in jobs/integration.jobs.ts and
   * jobs/dashboardCache.jobs.ts).
   */
  await agenda.every(
    isTestMode() ? "*/2 * * * *" : "7-59/15 * * * *",
    DASHBOARD_CACHE_REFRESH_JOB_NAME,
  );
  await agenda.now(DASHBOARD_CACHE_REFRESH_JOB_NAME, {});
  if (process.env.SKIP_CALENDAR_STARTUP_BACKFILL !== "1") {
    queueCalendarNotificationBackfill(agenda);
  }

  await bootstrapAlertAgendaSchedule(agenda);
  await bootstrapGoogleBusinessReviewAgendaSchedule(agenda);

  return agenda;
}

export async function shutdownAgenda(): Promise<void> {
  if (agenda) {
    await agenda.stop();
    logger.info("Agenda: scheduler stopped");
  }
}
