import mongoose, { Schema } from "mongoose";
import type { SalarySnapshot } from "../utils/homebaseSalary.util.js";

export interface HomebaseSalaryHistory extends SalarySnapshot {
  locationId: mongoose.Types.ObjectId;
  source: "observed" | "baseline";
  observedAt: Date;
}

const schema = new Schema<HomebaseSalaryHistory>({
  locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
  effectiveFrom: { type: String, required: true },
  salaries: [{
    _id: false,
    jobId: { type: Number, required: true },
    annualSalary: { type: Number, required: true, min: 0 },
  }],
  source: { type: String, enum: ["observed", "baseline"], required: true },
  observedAt: { type: Date, required: true },
}, { timestamps: true });

schema.index({ locationId: 1, effectiveFrom: 1 }, { unique: true });

export const HomebaseSalaryHistoryModel = mongoose.model<HomebaseSalaryHistory>(
  "HomebaseSalaryHistory", schema,
);
