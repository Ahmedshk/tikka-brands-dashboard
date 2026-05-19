import type { Agenda } from "agenda";
import mongoose from "mongoose";
import { ALERTS_EVALUATE_JOB, ALERTS_RESCHEDULE_JOB } from "../constants/alertAgendaJobs.js";
import { logger } from "../utils/logger.util.js";
import { isTestMode } from "../utils/reviewTimings.js";

/** Agenda's Mongo backend stores jobs in this collection (see config/agenda.ts). */
const AGENDA_JOBS_COLLECTION = "agendaJobs";
/**
 * Cancel all repeating `alerts:evaluate` jobs and register a single high-frequency tick.
 * Per-alert schedules are enforced inside `runAlertEvaluation` (fixed local times + per-rule intervals).
 */
export async function rescheduleAlertAgendaJobs(agenda: Agenda): Promise<void> {
  // We can't use `agenda.cancel({...})` here because the library's typed
  // RemoveJobsOptions doesn't expose `lockedAt`, and its Mongo backend
  // ignores unknown fields at runtime. So we drop down to the shared
  // mongoose connection and `deleteMany` directly with the filter we need.
  //
  // The filter excludes documents whose `lockedAt` is set, i.e. a worker
  // is currently running an evaluation. Without this, the original cancel
  // could delete the in-flight document mid-execution; when the worker
  // tried to `saveJobState` afterwards, Mongo had nothing to update and
  // Agenda logged `error job <id> (name: alerts:evaluate) cannot be
  // updated in the database, maybe it does not exist anymore?`.
  //
  // The `agenda.every` upsert below reuses the surviving locked entry
  // (same name + same interval), so no duplicate schedules are created.
  let cancelled = 0;
  try {
    const collection = mongoose.connection.db?.collection(AGENDA_JOBS_COLLECTION);
    if (collection) {
      const result = await collection.deleteMany({
        name: ALERTS_EVALUATE_JOB,
        lockedAt: null,
      });
      cancelled = result.deletedCount ?? 0;
    }
  } catch (err) {
    logger.warn("[Alerts] Cancel of prior alert jobs failed; proceeding to reschedule", { err });
  }
  logger.info("[Alerts] Cancelled prior alert jobs", { cancelled });

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
