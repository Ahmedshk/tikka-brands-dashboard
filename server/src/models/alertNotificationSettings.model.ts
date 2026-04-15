import mongoose, { Schema, Document, Types } from "mongoose";
import type {
  IAlertFinancialLaborToggles,
  IAlertRoleBinding,
  IAlertRunSchedule,
} from "../types/alertNotification.types.js";

export interface AlertNotificationSettingsDocument extends Document {
  _id: Types.ObjectId;
  /** @deprecated Legacy global schedule; migrated into per-alert `run` on read. */
  scheduleMode?: "fixed_times" | "interval";
  fixedTimesLocal?: string[];
  interval?: { hours: number; minutes: number };
  financialLabor: IAlertFinancialLaborToggles;
  inventorySupplyChain: {
    deliveryOverdueNotReceived: boolean;
    run?: IAlertRunSchedule;
    lowInventoryEnabled: boolean;
    lowInventoryRun?: IAlertRunSchedule;
    lowInventoryCadence: "every_run" | "once_per_day" | "once_per_episode";
  };
  reputationHr: {
    trainingOverdue: boolean;
    trainingRun?: IAlertRunSchedule;
    pendingPips: boolean;
    pendingPipsRun?: IAlertRunSchedule;
  };
  roleBindings: IAlertRoleBinding[];
  createdAt: Date;
  updatedAt: Date;
}

const intervalSubSchema = new Schema(
  {
    hours: { type: Number, default: 1, min: 0, max: 168 },
    minutes: { type: Number, default: 0, min: 0, max: 59 },
  },
  { _id: false },
);

const runScheduleSchema = new Schema(
  {
    scheduleMode: {
      type: String,
      enum: ["fixed_times", "interval"],
      default: "interval",
    },
    fixedTimesLocal: {
      type: [String],
      default: () => ["09:00"],
    },
    interval: {
      type: intervalSubSchema,
      default: () => ({ hours: 1, minutes: 0 }),
    },
  },
  { _id: false },
);

const metricToggleSchema = new Schema(
  {
    warnInToleranceZone: { type: Boolean, default: false },
    alertBeyondTolerance: { type: Boolean, default: false },
    run: { type: runScheduleSchema, default: () => ({}) },
  },
  { _id: false },
);

const financialLaborSchema = new Schema(
  {
    sales: { type: metricToggleSchema, default: () => ({}) },
    laborCostPct: { type: metricToggleSchema, default: () => ({}) },
    hours: { type: metricToggleSchema, default: () => ({}) },
    spmh: { type: metricToggleSchema, default: () => ({}) },
    foodCostPct: { type: metricToggleSchema, default: () => ({}) },
  },
  { _id: false },
);

const channelPrefsSchema = new Schema(
  {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
  },
  { _id: false },
);

const roleBindingSchema = new Schema(
  {
    category: {
      type: String,
      enum: ["financial_labor", "inventory_supply_chain", "reputation_hr"],
      required: true,
    },
    /** When absent, binding applies to all sub-types in the category (legacy). */
    subcategory: { type: String, required: false },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    channels: { type: channelPrefsSchema, required: true },
  },
  { _id: false },
);

const alertNotificationSettingsSchema = new Schema<AlertNotificationSettingsDocument>(
  {
    scheduleMode: {
      type: String,
      enum: ["fixed_times", "interval"],
      required: false,
    },
    fixedTimesLocal: { type: [String], required: false },
    interval: { type: intervalSubSchema, required: false },
    financialLabor: {
      type: financialLaborSchema,
      default: () => ({}),
    },
    inventorySupplyChain: {
      type: new Schema(
        {
          deliveryOverdueNotReceived: { type: Boolean, default: false },
          run: { type: runScheduleSchema, default: () => ({}) },
          lowInventoryEnabled: { type: Boolean, default: false },
          lowInventoryRun: { type: runScheduleSchema, default: () => ({}) },
          lowInventoryCadence: {
            type: String,
            enum: ["every_run", "once_per_day", "once_per_episode"],
            default: "once_per_episode",
          },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    reputationHr: {
      type: new Schema(
        {
          trainingOverdue: { type: Boolean, default: false },
          trainingRun: { type: runScheduleSchema, default: () => ({}) },
          pendingPips: { type: Boolean, default: false },
          pendingPipsRun: { type: runScheduleSchema, default: () => ({}) },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    roleBindings: { type: [roleBindingSchema], default: [] },
  },
  { timestamps: true },
);

export const AlertNotificationSettingsModel = mongoose.model<AlertNotificationSettingsDocument>(
  "AlertNotificationSettings",
  alertNotificationSettingsSchema,
);
