import type { Agenda } from "agenda";
import { ALERTS_EVALUATE_JOB } from "../constants/alertAgendaJobs.js";
import { runAlertEvaluation } from "../services/alertEvaluation.service.js";
import {
  registerAlertRescheduleJob,
  rescheduleAlertAgendaJobs,
} from "../services/alertAgendaSchedule.service.js";
import { logger } from "../utils/logger.util.js";

export function registerAlertJobs(agenda: Agenda): void {
  agenda.define(ALERTS_EVALUATE_JOB, async () => {
    logger.debug("Job: alerts:evaluate - running");
    try {
      await runAlertEvaluation();
    } catch (err) {
      logger.error("Job: alerts:evaluate failed", { err });
    }
  });

  registerAlertRescheduleJob(agenda);
}

export async function bootstrapAlertAgendaSchedule(agenda: Agenda): Promise<void> {
  await rescheduleAlertAgendaJobs(agenda);
}
