import mongoose, { Schema, Document, Types } from "mongoose";

export interface SquareTeamMemberDocument extends Document {
  _id: Types.ObjectId;
  /** Square team member id */
  squareId: string;
  locationId: Types.ObjectId;
  raw: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const squareTeamMemberSchema = new Schema<SquareTeamMemberDocument>(
  {
    squareId: { type: String, required: true, trim: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    raw: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

squareTeamMemberSchema.index({ squareId: 1, locationId: 1 }, { unique: true });
squareTeamMemberSchema.index({ locationId: 1 });

export const SquareTeamMemberModel = mongoose.model<SquareTeamMemberDocument>(
  "SquareTeamMember",
  squareTeamMemberSchema,
);
