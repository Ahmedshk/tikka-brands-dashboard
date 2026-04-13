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
