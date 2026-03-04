import { GoalRepository } from "../repositories/goal.repository.js";
import type {
  IGoal,
  IGoalValues,
  IGoalSetting,
  IResolvedGoalResult,
  DayOfWeek,
} from "../types/goal.types.js";
import { getWeekStartAndDayOfWeek } from "../utils/timezone.util.js";

const defaultGoalValues: IGoalValues = {
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

export class GoalService {
  private readonly goalRepository: GoalRepository;

  constructor() {
    this.goalRepository = new GoalRepository();
  }

  /**
   * Get full goal setting for editing (default, weekly, futureWeeks).
   * Maps legacy documents (top-level goals only) to new shape.
   */
  async getByLocationId(locationId: string): Promise<IGoalSetting> {
    const doc = await this.goalRepository.findByLocationId(locationId);
    if (!doc) {
      return {
        locationId,
        default: { ...defaultGoalValues },
        weekly: {},
        futureWeeks: [],
      };
    }
    return this.docToSetting(doc);
  }

  /**
   * Get resolved goals for a specific date (YYYY-MM-DD in location timezone).
   * Resolution: future week override for that week+day → weekly[dayOfWeek] → default.
   * Returns goal and source so clients can show only explicitly set goals.
   * Each field (goal or tolerance) is taken from the resolved values for the date when present;
   * when not present (e.g. goal set but tolerance not set for that date), the default value (0) is used.
   */
  async getByLocationIdAndDate(
    locationId: string,
    dateStr: string
  ): Promise<IResolvedGoalResult> {
    const setting = await this.getByLocationId(locationId);
    const { weekStartDate, dayOfWeek } = getWeekStartAndDayOfWeek(dateStr);

    const futureWeek = setting.futureWeeks?.find(
      (w) => w.weekStartDate === weekStartDate
    );
    const futureDay = futureWeek?.days?.[dayOfWeek as DayOfWeek];
    if (futureDay) {
      return {
        goals: this.valuesToGoal(locationId, { ...defaultGoalValues, ...futureDay }),
        source: "futureWeek",
      };
    }

    const weeklyDay = setting.weekly?.[dayOfWeek as DayOfWeek];
    if (weeklyDay) {
      return {
        goals: this.valuesToGoal(locationId, { ...defaultGoalValues, ...weeklyDay }),
        source: "weekly",
      };
    }

    return {
      goals: this.valuesToGoal(locationId, { ...defaultGoalValues, ...setting.default }),
      source: "default",
    };
  }

  /**
   * Upsert goal setting. Merges with existing; omitted keys are not wiped.
   */
  async upsert(
    locationId: string,
    data: {
      default?: IGoalValues;
      weekly?: Partial<Record<DayOfWeek, IGoalValues>>;
      futureWeeks?: Array<{
        weekStartDate: string;
        days: Partial<Record<DayOfWeek, IGoalValues>>;
      }>;
    }
  ): Promise<IGoalSetting> {
    const doc = await this.goalRepository.upsertByLocationId(locationId, data);
    return this.docToSetting(doc);
  }

  private docToSetting(doc: {
    locationId: string;
    default?: IGoalValues | null;
    weekly?: Partial<Record<DayOfWeek, IGoalValues>> | null;
    futureWeeks?: Array<{ weekStartDate: string; days: Partial<Record<DayOfWeek, IGoalValues>> }> | null;
    salesGoal?: number;
    laborCostGoal?: number;
    hoursGoal?: number;
    spmhGoal?: number;
    foodCostGoal?: number;
  }): IGoalSetting {
    let legacyValues: IGoalValues | null = null;
    if (doc.default == null && typeof doc.salesGoal === "number") {
      legacyValues = {
        salesGoal: doc.salesGoal ?? 0,
        laborCostGoal: doc.laborCostGoal ?? 0,
        hoursGoal: doc.hoursGoal ?? 0,
        spmhGoal: doc.spmhGoal ?? 0,
        foodCostGoal: doc.foodCostGoal ?? 0,
        salesGoalTolerance: 0,
        laborCostGoalTolerance: 0,
        hoursGoalTolerance: 0,
        spmhGoalTolerance: 0,
        foodCostGoalTolerance: 0,
      };
    }

    const defaultVal: IGoalValues = {
      ...defaultGoalValues,
      ...(doc.default ?? legacyValues ?? {}),
    };

    return {
      locationId: doc.locationId,
      default: defaultVal,
      weekly: doc.weekly ?? {},
      futureWeeks: doc.futureWeeks ?? [],
    };
  }

  private valuesToGoal(locationId: string, values: IGoalValues): IGoal {
    return {
      locationId,
      ...values,
    };
  }
}
