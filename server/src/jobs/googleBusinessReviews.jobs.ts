import type { Agenda } from "agenda";
import { GOOGLE_BUSINESS_SYNC_REVIEWS_JOB } from "../constants/googleBusinessAgendaJobs.js";
import { syncGoogleBusinessReviewsForAllLocations } from "../services/googleBusinessReviewSync.service.js";
import { logger } from "../utils/logger.util.js";
import { isTestMode } from "../utils/reviewTimings.js";

export function registerGoogleBusinessReviewJobs(agenda: Agenda): void {
  agenda.define(GOOGLE_BUSINESS_SYNC_REVIEWS_JOB, async () => {
    try {
      logger.info("[GoogleBusiness] scheduled sync tick");
      await syncGoogleBusinessReviewsForAllLocations();
    } catch (err) {
      logger.error("[GoogleBusiness] sync job failed", { err });
    }
  });
}

/** Google Business Profile review sync runs hourly (fixed server schedule, not user settings). */
export async function bootstrapGoogleBusinessReviewAgendaSchedule(
  agenda: Agenda,
): Promise<void> {
  await agenda.every(
    isTestMode() ? "*/3 * * * *" : "0 * * * *",
    GOOGLE_BUSINESS_SYNC_REVIEWS_JOB,
  );
}
