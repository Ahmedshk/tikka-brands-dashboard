import { GoalRepository } from "../repositories/goal.repository.js";
import type {
  IGoal,
  IGoalValues,
  IGoalSetting,
  IResolvedGoalResult,
  DayOfWeek,
  IDefaultGoalHistoryEntry,
} from "../types/goal.types.js";
import { getWeekStartAndDayOfWeek } from "../utils/timezone.util.js";
import { goalValuesEqual } from "../utils/goalValuesCompare.util.js";

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

const BASELINE_HISTORY_FROM = "1970-01-01";

function mergeDefaultFromRawDoc(doc: {
  default?: IGoalValues | null;
  salesGoal?: number;
  laborCostGoal?: number;
  hoursGoal?: number;
  spmhGoal?: number;
  foodCostGoal?: number;
}): IGoalValues {
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
  return {
    ...defaultGoalValues,
    ...(doc.default ?? legacyValues),
  };
}

/**
 * Best default snapshot for calendar dateStr (YYYY-MM-DD): latest history row with effectiveFrom <= dateStr
 * (ties on effectiveFrom: last row in array order wins).
 */
export function resolveDefaultForDate(
  defaultHistory: IDefaultGoalHistoryEntry[] | undefined | null,
  currentDefault: IGoalValues,
  dateStr: string,
): { values: IGoalValues; snapshotEffectiveFrom?: string } {
  const rows = defaultHistory ?? [];
  const candidates = rows
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => row.effectiveFrom <= dateStr)
    .sort((a, b) => {
      const c = a.row.effectiveFrom.localeCompare(b.row.effectiveFrom);
      if (c !== 0) return c;
      return a.idx - b.idx;
    });
  const best = candidates.at(-1)?.row ?? null;
  if (best != null) {
    return {
      values: { ...defaultGoalValues, ...best.values },
      snapshotEffectiveFrom: best.effectiveFrom,
    };
  }
  return { values: { ...defaultGoalValues, ...currentDefault } };
}

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
        defaultHistory: [],
      };
    }
    return this.docToSetting(doc);
  }

  /**
   * Get resolved goals for a specific date (YYYY-MM-DD in location timezone).
   * Resolution: future week override for that week+day → weekly[dayOfWeek] → default (historical when history exists).
   */
  async getByLocationIdAndDate(
    locationId: string,
    dateStr: string,
  ): Promise<IResolvedGoalResult> {
    const setting = await this.getByLocationId(locationId);
    const { weekStartDate, dayOfWeek } = getWeekStartAndDayOfWeek(dateStr);

    const futureWeek = setting.futureWeeks?.find(
      (w) => w.weekStartDate === weekStartDate,
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

    const resolved = resolveDefaultForDate(
      setting.defaultHistory,
      setting.default,
      dateStr,
    );
    return {
      goals: this.valuesToGoal(locationId, resolved.values),
      source: "default",
      ...(resolved.snapshotEffectiveFrom === undefined
        ? {}
        : { defaultSnapshotEffectiveFrom: resolved.snapshotEffectiveFrom }),
    };
  }

  /**
   * Upsert goal setting. Merges with existing; omitted keys are not wiped.
   * When `defaultEffectiveFrom` is set and body includes `default` with values that differ from stored default, appends defaultHistory.
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
    },
    options?: { defaultEffectiveFrom?: string },
  ): Promise<IGoalSetting> {
    const existing = await this.goalRepository.findByLocationId(locationId);
    const previousMergedDefault = existing
      ? mergeDefaultFromRawDoc(existing)
      : { ...defaultGoalValues };

    const mergedDefault =
      data.default === undefined
        ? previousMergedDefault
        : { ...defaultGoalValues, ...data.default };

    let appendDefaultHistory: IDefaultGoalHistoryEntry[] | undefined;
    if (
      data.default !== undefined &&
      options?.defaultEffectiveFrom != null &&
      options.defaultEffectiveFrom.trim() !== "" &&
      !goalValuesEqual(mergedDefault, previousMergedDefault)
    ) {
      const effectiveFrom = options.defaultEffectiveFrom.trim();
      const history = existing?.defaultHistory ?? [];
      const last = history.at(-1);
      const duplicateSameDay =
        last?.effectiveFrom === effectiveFrom &&
        goalValuesEqual(last.values, mergedDefault);
      if (!duplicateSameDay) {
        const pushes: IDefaultGoalHistoryEntry[] = [];
        if (existing == null) {
          pushes.push({ effectiveFrom, values: { ...mergedDefault } });
        } else if (history.length === 0) {
          pushes.push(
            {
              effectiveFrom: BASELINE_HISTORY_FROM,
              values: { ...previousMergedDefault },
            },
            { effectiveFrom, values: { ...mergedDefault } },
          );
        } else {
          pushes.push({ effectiveFrom, values: { ...mergedDefault } });
        }
        appendDefaultHistory = pushes;
      }
    }

    const doc = await this.goalRepository.upsertByLocationId(
      locationId,
      data,
      appendDefaultHistory,
    );
    return this.docToSetting(doc);
  }

  private docToSetting(doc: {
    locationId: string;
    default?: IGoalValues | null;
    weekly?: Partial<Record<DayOfWeek, IGoalValues>> | null;
    futureWeeks?:
      | Array<{ weekStartDate: string; days: Partial<Record<DayOfWeek, IGoalValues>> }>
      | null;
    defaultHistory?: IDefaultGoalHistoryEntry[] | null;
    salesGoal?: number;
    laborCostGoal?: number;
    hoursGoal?: number;
    spmhGoal?: number;
    foodCostGoal?: number;
  }): IGoalSetting {
    const defaultVal = mergeDefaultFromRawDoc(doc);

    const rawHistory = doc.defaultHistory ?? [];
    const defaultHistory: IDefaultGoalHistoryEntry[] = rawHistory.map((e) => ({
      effectiveFrom: e.effectiveFrom,
      values: { ...defaultGoalValues, ...e.values },
    }));

    return {
      locationId: doc.locationId,
      default: defaultVal,
      weekly: doc.weekly ?? {},
      futureWeeks: doc.futureWeeks ?? [],
      defaultHistory,
    };
  }

  private valuesToGoal(locationId: string, values: IGoalValues): IGoal {
    return {
      locationId,
      ...values,
    };
  }
}
