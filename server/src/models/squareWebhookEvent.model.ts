import mongoose, { Schema, Document } from "mongoose";

export interface SquareWebhookEventDocument extends Document {
  eventId: string;
  createdAt: Date;
}

const squareWebhookEventSchema = new Schema<SquareWebhookEventDocument>(
  {
    eventId: { type: String, required: true, unique: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

squareWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

export const SquareWebhookEventModel = mongoose.model<SquareWebhookEventDocument>(
  "SquareWebhookEvent",
  squareWebhookEventSchema,
);
