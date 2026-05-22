import type { UpdateQuery } from "mongoose";
import { GoalModel, GoalDocument } from "../models/goal.model.js";
import type {
  IGoalValues,
  DayOfWeek,
  IDefaultGoalHistoryEntry,
} from "../types/goal.types.js";

export class GoalRepository {
  async findByLocationId(locationId: string): Promise<GoalDocument | null> {
    return (await GoalModel.findOne({ locationId }).lean().exec()) as GoalDocument | null;
  }

  /**
   * Bulk fetch goal settings for many locations in one round-trip. Used by the
   * all-locations `/goals/range` aggregation to collapse N find-by-id calls
   * into a single `$in` query. Returns a map keyed by locationId; missing
   * locations are simply absent (callers default to baseline goal values).
   */
  async findByLocationIds(
    locationIds: readonly string[],
  ): Promise<Map<string, GoalDocument>> {
    if (locationIds.length === 0) return new Map();
    const docs = (await GoalModel.find({ locationId: { $in: [...locationIds] } })
      .lean()
      .exec()) as GoalDocument[];
    const byId = new Map<string, GoalDocument>();
    for (const doc of docs) byId.set(String(doc.locationId), doc);
    return byId;
  }

  /**
   * Upsert goal setting. Accepts full or partial default/weekly/futureWeeks.
   * Merges with existing document so omitted keys are not wiped.
   * Optionally appends rows to defaultHistory (does not replace the array).
   */
  async upsertByLocationId(
    locationId: string,
    data: {
      default?: IGoalValues;
      weekly?: Partial<Record<DayOfWeek, IGoalValues>>;
      futureWeeks?: Array<{
        weekStartDate: string;
        days: Partial<Record<DayOfWeek, IGoalValues>>;
      }>;
    },
    appendDefaultHistory?: IDefaultGoalHistoryEntry[],
  ): Promise<GoalDocument> {
    const existing = await GoalModel.findOne({ locationId }).lean().exec();
    const defaultValues: IGoalValues = {
      salesGoal: 0,
      laborCostGoal: 0,
      hoursGoal: 0,
      spmhGoal: 0,
      foodCostGoal: 0,
      salesGoalTolerance: 0,
      laborCostGoalTolerance: 0,
      hoursGoalTolerance: 0,
      spmhGoalTolerance: 0,
      foodCostGoalTolerance: 0,
    };

    const merged = {
      locationId,
      default: data.default ?? existing?.default ?? defaultValues,
      weekly: data.weekly ?? existing?.weekly ?? {},
      futureWeeks: data.futureWeeks ?? existing?.futureWeeks ?? [],
    };

    const update: UpdateQuery<GoalDocument> = {
      $set: {
        locationId,
        default: merged.default,
        weekly: merged.weekly,
        futureWeeks: merged.futureWeeks,
      },
    };

    if (appendDefaultHistory != null && appendDefaultHistory.length > 0) {
      update.$push = {
        defaultHistory: { $each: appendDefaultHistory },
      };
    }

    const doc = await GoalModel.findOneAndUpdate({ locationId }, update, {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    })
      .lean()
      .exec();

    return doc as GoalDocument;
  }
}
