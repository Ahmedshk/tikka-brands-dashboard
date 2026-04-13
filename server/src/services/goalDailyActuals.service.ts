/**
 * Per-business-day actuals for Goal Setting (Square + Homebase; rollup-first).
 */
import mongoose from "mongoose";
import { SquareOrderDailyRollupModel } from "../models/squareOrderDailyRollup.model.js";
import { HomebaseTimecardDailyRollupModel } from "../models/homebaseTimecardDailyRollup.model.js";
import { LocationService } from "./location.service.js";
import { NotFoundError } from "../utils/errors.util.js";
import { businessDayUtcRangeIsoStrings } from "../utils/businessDayUtcRange.util.js";
import {
  getOrderStatsAndSourcesFromCache,
  getLaborCostInRangeFromCache,
  getTotalHoursInRangeFromCache,
  type RollupReadContext,
} from "./integrationCacheRead.service.js";

const MAX_DATES = 14;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type GoalDailyActualsRow = {
  actualSales: number | null;
  actualLaborCostPercent: number | null;
  actualHours: number | null;
  actualSalesPerManHour: number | null;
  actualFoodCostPercent: number | null;
};

function normalizeDates(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const t = s.trim();
    if (!YMD.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_DATES) break;
  }
  return out;
}

function computeDerived(
  sales: number | null,
  laborCost: number | null,
  hours: number | null,
): Pick<
  GoalDailyActualsRow,
  "actualLaborCostPercent" | "actualSalesPerManHour"
> {
  let actualLaborCostPercent: number | null = null;
  if (
    sales !== null &&
    laborCost !== null &&
    sales > 0
  ) {
    actualLaborCostPercent = (laborCost / sales) * 100;
  }
  let actualSalesPerManHour: number | null = null;
  if (sales !== null && hours !== null && hours > 0) {
    actualSalesPerManHour = sales / hours;
  }
  return { actualLaborCostPercent, actualSalesPerManHour };
}

const locationService = new LocationService();

export async function getGoalDailyActualsByDates(
  locationId: string,
  dateInputs: string[],
): Promise<Record<string, GoalDailyActualsRow>> {
  const dates = normalizeDates(dateInputs);
  const empty: Record<string, GoalDailyActualsRow> = {};
  for (const d of dates) {
    empty[d] = {
      actualSales: null,
      actualLaborCostPercent: null,
      actualHours: null,
      actualSalesPerManHour: null,
      actualFoodCostPercent: null,
    };
  }
  if (dates.length === 0) {
    return empty;
  }

  const location = await locationService.getById(locationId);
  if (!location) {
    throw new NotFoundError("Location not found");
  }

  const timezone = location.timezone?.trim() || "America/Denver";
  const businessStartTime = location.businessStartTime?.trim() ?? "00:00";
  const rollupCtx: RollupReadContext = { timezone, businessStartTime };
  const oid = new mongoose.Types.ObjectId(locationId);

  const [squareRows, homebaseRows] = await Promise.all([
    SquareOrderDailyRollupModel.find({
      locationId: oid,
      businessDateKey: { $in: dates },
    })
      .select({ businessDateKey: 1, netSalesCents: 1 })
      .lean()
      .exec(),
    HomebaseTimecardDailyRollupModel.find({
      locationId: oid,
      businessDateKey: { $in: dates },
    })
      .select({ businessDateKey: 1, totalLaborCost: 1, totalPaidHours: 1 })
      .lean()
      .exec(),
  ]);

  const squareByKey = new Map(
    squareRows.map((r) => [r.businessDateKey, r]),
  );
  const homebaseByKey = new Map(
    homebaseRows.map((r) => [r.businessDateKey, r]),
  );

  const result: Record<string, GoalDailyActualsRow> = { ...empty };

  await Promise.all(
    dates.map(async (date) => {
      const range = businessDayUtcRangeIsoStrings(
        timezone,
        businessStartTime,
        date,
      );

      let sales: number | null = null;
      const sq = squareByKey.get(date);
      if (sq) {
        sales = (sq.netSalesCents ?? 0) / 100;
      } else {
        const stats = await getOrderStatsAndSourcesFromCache(
          locationId,
          range,
          rollupCtx,
        );
        if (stats) {
          sales = stats.actualTotalSales;
        }
      }

      let laborCost: number | null = null;
      let hours: number | null = null;
      const hb = homebaseByKey.get(date);
      if (hb) {
        laborCost = hb.totalLaborCost ?? 0;
        hours = hb.totalPaidHours ?? 0;
      } else {
        const [lc, th] = await Promise.all([
          getLaborCostInRangeFromCache(locationId, range),
          getTotalHoursInRangeFromCache(locationId, range),
        ]);
        laborCost = lc;
        hours = th;
      }

      const { actualLaborCostPercent, actualSalesPerManHour } = computeDerived(
        sales,
        laborCost,
        hours,
      );

      result[date] = {
        actualSales: sales,
        actualHours: hours,
        actualLaborCostPercent,
        actualSalesPerManHour,
        actualFoodCostPercent: null,
      };
    }),
  );

  return result;
}
