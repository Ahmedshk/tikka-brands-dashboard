import { Types } from "mongoose";

/**
 * Employee id string from `ReviewCycle.employeeId` after populate(...).lean().
 * Avoids `String(object)` / `[object Object]` when the shape is unexpected.
 */
export function employeeIdStringFromCyclePopulateLean(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof Types.ObjectId) return raw.toString();

  if (typeof raw === "object" && "_id" in raw) {
    const nested = (raw as { _id?: unknown })._id;
    if (nested instanceof Types.ObjectId) return nested.toString();
    if (typeof nested === "string") return nested;
  }

  return "";
}
