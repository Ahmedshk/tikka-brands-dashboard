import type { Agenda } from "agenda";
import { ALERTS_EVALUATE_JOB, ALERTS_RESCHEDULE_JOB } from "../constants/alertAgendaJobs.js";
import { logger } from "../utils/logger.util.js";
import { isTestMode } from "../utils/reviewTimings.js";
/**
 * Cancel all repeating `alerts:evaluate` jobs and register a single high-frequency tick.
 * Per-alert schedules are enforced inside `runAlertEvaluation` (fixed local times + per-rule intervals).
 */
export async function rescheduleAlertAgendaJobs(agenda: Agenda): Promise<void> {
  const n = await agenda.cancel({ name: ALERTS_EVALUATE_JOB });
  logger.info("[Alerts] Cancelled prior alert jobs", { cancelled: n });

  const spec = isTestMode() ? "30 seconds" : "1 minute";
  await agenda.every(spec, ALERTS_EVALUATE_JOB);
  logger.info("[Alerts] Scheduled alert evaluation tick", { spec });
}

export function registerAlertRescheduleJob(agenda: Agenda): void {
  agenda.define(ALERTS_RESCHEDULE_JOB, async () => {
    await rescheduleAlertAgendaJobs(agenda);
  });
}

export async function queueAlertReschedule(agenda: Agenda): Promise<void> {
  try {
    await agenda.now(ALERTS_RESCHEDULE_JOB);
  } catch (e) {
    logger.warn("[Alerts] queueAlertReschedule failed", { e });
  }
}
