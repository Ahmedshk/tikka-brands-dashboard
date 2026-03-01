import { GoalModel, GoalDocument } from "../models/goal.model.js";
import type { IGoalValues, DayOfWeek } from "../types/goal.types.js";

export class GoalRepository {
  async findByLocationId(locationId: string): Promise<GoalDocument | null> {
    return await GoalModel.findOne({ locationId }).lean().exec() as GoalDocument | null;
  }

  /**
   * Upsert goal setting. Accepts full or partial default/weekly/futureWeeks.
   * Merges with existing document so omitted keys are not wiped.
   */
  async upsertByLocationId(
    locationId: string,
    data: {
      default?: IGoalValues;
      weekly?: Partial<Record<DayOfWeek, IGoalValues>>;
      futureWeeks?: Array<{ weekStartDate: string; days: Partial<Record<DayOfWeek, IGoalValues>> }>;
    }
  ): Promise<GoalDocument> {
    const existing = await GoalModel.findOne({ locationId }).lean().exec();
    const defaultValues: IGoalValues = {
      salesGoal: 0,
      laborCostGoal: 0,
      hoursGoal: 0,
      spmhGoal: 0,
      foodCostGoal: 0,
    };

    const merged = {
      locationId,
      default: data.default ?? existing?.default ?? defaultValues,
      weekly: data.weekly ?? existing?.weekly ?? {},
      futureWeeks: data.futureWeeks ?? existing?.futureWeeks ?? [],
    };

    const doc = await GoalModel.findOneAndUpdate(
      { locationId },
      { $set: merged },
      { new: true, upsert: true, runValidators: true }
    ).lean().exec();

    return doc as GoalDocument;
  }
}
