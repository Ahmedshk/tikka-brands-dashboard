import mongoose, { Schema, Document, Types } from "mongoose";

export type IntegrationSyncResource =
  | "square_payments"
  | "square_orders"
  | "square_catalog"
  | "square_team_members"
  | "homebase_timecards"
  | "marketman_valid_count_dates"
  | "marketman_orders_sent"
  | "marketman_orders_delivery"
  | "marketman_orders_both";

/** Log documents may include resources no longer valid for POST /integration-sync */
export type IntegrationSyncLogResource =
  | IntegrationSyncResource
  | "all_resources_today"
  | "marketman_actual_theo"
  | "marketman_waste";

export type IntegrationSyncStatus = "started" | "success" | "failed";

export interface IntegrationSyncLogDocument extends Document {
  _id: Types.ObjectId;
  triggeredByUserId?: Types.ObjectId;
  resource: IntegrationSyncLogResource;
  locationIds: string[];
  startDate?: string;
  endDate?: string;
  status: IntegrationSyncStatus;
  message?: string;
  counts?: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const integrationSyncLogSchema = new Schema<IntegrationSyncLogDocument>(
  {
    triggeredByUserId: { type: Schema.Types.ObjectId, ref: "User", required: false },
    resource: { type: String, required: true },
    locationIds: { type: [String], default: [] },
    startDate: { type: String, required: false },
    endDate: { type: String, required: false },
    status: {
      type: String,
      required: true,
      enum: ["started", "success", "failed"],
    },
    message: { type: String, required: false },
    counts: { type: Schema.Types.Mixed, required: false },
  },
  { timestamps: true },
);

integrationSyncLogSchema.index({ createdAt: -1 });
integrationSyncLogSchema.index({ resource: 1, createdAt: -1 });

export const IntegrationSyncLogModel = mongoose.model<IntegrationSyncLogDocument>(
  "IntegrationSyncLog",
  integrationSyncLogSchema,
);
