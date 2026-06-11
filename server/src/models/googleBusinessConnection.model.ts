import mongoose, { Schema, Document, Types } from "mongoose";

export interface GoogleBusinessConnectionDocument extends Document {
  _id: Types.ObjectId;
  /** Singleton key — only one org connection document. */
  singletonKey: "default";
  refreshTokenEnc: string;
  connectedEmail: string;
  connectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const googleBusinessConnectionSchema = new Schema<GoogleBusinessConnectionDocument>(
  {
    singletonKey: {
      type: String,
      required: true,
      unique: true,
      default: "default",
      enum: ["default"],
    },
    refreshTokenEnc: { type: String, required: true },
    connectedEmail: { type: String, required: true, trim: true },
    connectedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export const GoogleBusinessConnectionModel = mongoose.model<GoogleBusinessConnectionDocument>(
  "GoogleBusinessConnection",
  googleBusinessConnectionSchema,
);
