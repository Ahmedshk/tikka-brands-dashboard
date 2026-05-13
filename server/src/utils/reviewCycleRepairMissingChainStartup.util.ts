import { ReviewCycleModel } from "../models/reviewCycle.model.js";
import { addPeriod, NEXT_CYCLE_OFFSET } from "./reviewTimings.js";
import { logger } from "./logger.util.js";
import type { ReviewCycleStatus } from "../types/reviewCycle.types.js";

const REPAIR_MAX_ITERATIONS = 200;

const REPAIR_CYCLE_SELECT =
  "_id employeeId cycleNumber referenceDate dueDate90 scheduledNextCycleReferenceDate status";

export type RepairMissingChainStartupCycle = {
  _id: unknown;
  employeeId: { toString(): string } | string;
  cycleNumber: number;
  referenceDate: Date;
  dueDate90: Date;
  scheduledNextCycleReferenceDate?: Date;
  status: ReviewCycleStatus;
};

export type CreateCycleForEmployeeRepairFn = (
  employeeId: string,
  referenceDate: Date,
  cycleNumber: number,
  opts?: { suppressNotifications?: boolean },
) => Promise<void>;

function nextExpectedReferenceFromCycle(c: RepairMissingChainStartupCycle): Date {
  return c.scheduledNextCycleReferenceDate
    ? new Date(c.scheduledNextCycleReferenceDate)
    : addPeriod(new Date(c.referenceDate), NEXT_CYCLE_OFFSET);
}

function bumpExpectationsFromCycle(c: RepairMissingChainStartupCycle): {
  expectedReference: Date;
  expectedCycleNumber: number;
} {
  return {
    expectedReference: nextExpectedReferenceFromCycle(c),
    expectedCycleNumber: c.cycleNumber + 1,
  };
}

export type RepairMissingChainForEmployeeMetrics = {
  cyclesCreated: number;
  cyclesSuperseded: number;
  activeCyclesCreated: number;
  errors: number;
};

/**
 * Backfills missing review cycles for one employee from their latest cycle until `now` (startup repair).
 */
export async function repairMissingCycleChainForEmployee(options: {
  employeeId: string;
  latest: RepairMissingChainStartupCycle;
  now: Date;
  createCycleForEmployee: CreateCycleForEmployeeRepairFn;
}): Promise<RepairMissingChainForEmployeeMetrics> {
  const { employeeId, latest, now, createCycleForEmployee } = options;

  const metrics: RepairMissingChainForEmployeeMetrics = {
    cyclesCreated: 0,
    cyclesSuperseded: 0,
    activeCyclesCreated: 0,
    errors: 0,
  };

  let current = latest;
  let { expectedReference, expectedCycleNumber } = bumpExpectationsFromCycle(current);
  let iterations = 0;

  while (expectedReference <= now) {
    iterations += 1;
    if (iterations > REPAIR_MAX_ITERATIONS) {
      metrics.errors += 1;
      logger.warn("Review cycle startup repair: max iteration safeguard reached", {
        employeeId,
        currentCycleId: current._id,
        expectedCycleNumber,
        expectedReference,
      });
      break;
    }

    const existing = (await ReviewCycleModel.findOne({
      employeeId,
      $or: [{ cycleNumber: expectedCycleNumber }, { dueDate90: expectedReference }],
    })
      .select(REPAIR_CYCLE_SELECT)
      .lean()) as RepairMissingChainStartupCycle | null;

    if (existing) {
      current = existing;
      ({ expectedReference, expectedCycleNumber } = bumpExpectationsFromCycle(current));
      continue;
    }

    try {
      await createCycleForEmployee(employeeId, new Date(expectedReference), expectedCycleNumber, {
        suppressNotifications: true,
      });
      metrics.cyclesCreated += 1;
    } catch (err) {
      metrics.errors += 1;
      logger.error("Review cycle startup repair: failed creating missing cycle", {
        employeeId,
        expectedCycleNumber,
        expectedReference,
        err,
      });
      break;
    }

    const created = (await ReviewCycleModel.findOne({
      employeeId,
      cycleNumber: expectedCycleNumber,
    })
      .select(REPAIR_CYCLE_SELECT)
      .lean()) as RepairMissingChainStartupCycle | null;

    if (!created) {
      metrics.errors += 1;
      logger.warn("Review cycle startup repair: cycle create reported success but record not found", {
        employeeId,
        expectedCycleNumber,
      });
      break;
    }

    const createdNextReference = nextExpectedReferenceFromCycle(created);

    if (createdNextReference <= now) {
      if (created.status !== "cycle_superseded") {
        await ReviewCycleModel.updateOne(
          { _id: created._id as string },
          { $set: { status: "cycle_superseded" as ReviewCycleStatus } },
        );
        metrics.cyclesSuperseded += 1;
      }
      current = { ...created, status: "cycle_superseded" };
      expectedReference = createdNextReference;
      expectedCycleNumber = created.cycleNumber + 1;
      continue;
    }

    metrics.activeCyclesCreated += 1;
    break;
  }

  return metrics;
}
