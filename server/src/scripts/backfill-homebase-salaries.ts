/** Seed the authorized September 13 baseline from current Homebase rates. Dry-run by default. */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { LocationModel } from "../models/location.model.js";
import { HomebaseSalaryHistoryModel } from "../models/homebaseSalaryHistory.model.js";
import { LocationService } from "../services/location.service.js";
import { getEmployeesForLocation } from "../services/homebase.service.js";
import { observeHomebaseSalaries, invalidateSalaryDashboardCaches } from "../services/homebaseSalary.service.js";
import { salaryRatesFromEmployees, SALARY_REPORTING_START } from "../utils/homebaseSalary.util.js";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"), quiet: true });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let locationId: string | undefined;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply") apply = true;
    else if (args[i] === "--locationId") {
      locationId = args[++i];
      if (!locationId || !mongoose.isValidObjectId(locationId)) throw new Error("Invalid --locationId");
    } else throw new Error(`Unknown option: ${args[i]}`);
  }
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const locations = await LocationModel.find({
    ...(locationId ? { _id: locationId } : {}),
    homebaseLocationId: { $exists: true, $nin: [null, ""] },
  }).select({ _id: 1, storeName: 1 }).lean().exec();
  if (!locations.length) throw new Error("No Homebase locations matched");
  const service = new LocationService();
  // Fetch and validate every roster before writing any baseline.
  const prepared = [];
  for (const location of locations) {
    const id = String(location._id);
    const creds = await service.getByIdWithCredentials(id);
    const uuid = creds?.location.homebaseLocationId?.trim();
    if (!uuid || !creds?.homebaseApiKey) throw new Error(`Missing Homebase credentials for ${id}`);
    const employees = await getEmployeesForLocation(uuid, creds.homebaseApiKey, { strictPayload: true });
    const rates = salaryRatesFromEmployees(employees, uuid);
    const baselineExists = await HomebaseSalaryHistoryModel.exists({ locationId: id, effectiveFrom: SALARY_REPORTING_START });
    console.log(JSON.stringify({ locationId: id, storeName: location.storeName, salaryJobs: rates.length,
      currentDailySalary: rates.reduce((sum, rate) => sum + rate.annualSalary, 0) / 364,
      baselineFrom: SALARY_REPORTING_START, baselineExists: Boolean(baselineExists), apply }));
    prepared.push({ id, uuid, employees, context: {
      timezone: creds.location.timezone, businessStartTime: creds.location.businessStartTime || "00:00",
    } });
  }
  if (apply) {
    await HomebaseSalaryHistoryModel.init();
    for (const row of prepared) await observeHomebaseSalaries(row.id, row.uuid, row.employees, row.context);
    // Also expire caches on retries after an interrupted earlier backfill.
    await invalidateSalaryDashboardCaches();
    console.log("Salary baseline applied; existing baselines preserved. Dashboard caches expired.");
  } else console.log("Dry run only. Re-run with --apply to save salary history.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => { await mongoose.disconnect(); });
