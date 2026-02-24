import mongoose, { Schema, Document, Types } from "mongoose";
import { IRole } from "../types/rbac.types.js";

export interface RoleDocument
  extends Omit<IRole, "_id" | "createdAt" | "updatedAt" | "locations">,
    Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  /** When 'all', role can access every location; when 'specific', use locationIds. */
  locationAccess: "all" | "specific";
  /** Refs to Location; only used when locationAccess === 'specific'. */
  locationIds: Types.ObjectId[];
}

const pagePermissionSchema = new Schema(
  {
    pageId: { type: String, required: true },
    pageLabel: { type: String, required: true },
    components: [{ type: String }],
  },
  { _id: false }
);

const rolePermissionsSchema = new Schema(
  {
    type: { type: String, enum: ["all", "custom"], required: true },
    pages: [pagePermissionSchema],
  },
  { _id: false }
);

const roleSchema = new Schema<RoleDocument>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    permissions: {
      type: rolePermissionsSchema,
      required: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    locationAccess: {
      type: String,
      enum: ["all", "specific"],
      default: "all",
    },
    locationIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Location",
      },
    ],
    notificationTypes: {
      type: [String],
      default: undefined,
      select: false, // reserved for future
    },
  },
  {
    timestamps: true,
  }
);

export const RoleModel = mongoose.model<RoleDocument>("Role", roleSchema);
