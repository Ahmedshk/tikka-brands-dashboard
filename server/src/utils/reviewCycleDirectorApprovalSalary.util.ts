import type { ReviewCycleDocument } from "../models/reviewCycle.model.js";
import { AppError } from "./errors.util.js";

/**
 * Validates director-provided salary increment and applies it to the cycle, or clears increment fields.
 */
export function applyDirectorApprovalSalaryFields(
  cycle: ReviewCycleDocument,
  salaryIncrement: number | undefined,
  salaryIncrementType: "percent" | "fixed" | undefined,
): void {
  const hasIncrement =
    salaryIncrement !== undefined &&
    salaryIncrement !== null &&
    Number.isFinite(salaryIncrement);

  if (!hasIncrement) {
    delete cycle.salaryIncrement;
    delete cycle.salaryIncrementType;
    return;
  }

  const kind: "percent" | "fixed" = salaryIncrementType === "fixed" ? "fixed" : "percent";
  if (kind === "percent") {
    if (salaryIncrement < 0 || salaryIncrement > 100) {
      throw new AppError("Salary increment must be between 0 and 100 percent", 400);
    }
    cycle.salaryIncrement = salaryIncrement;
    cycle.salaryIncrementType = "percent";
    return;
  }

  if (salaryIncrement < 0) {
    throw new AppError("Fixed salary increment must be non-negative", 400);
  }
  if (salaryIncrement > 50_000_000) {
    throw new AppError("Fixed salary increment is too large", 400);
  }
  cycle.salaryIncrement = salaryIncrement;
  cycle.salaryIncrementType = "fixed";
}
