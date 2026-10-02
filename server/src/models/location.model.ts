import mongoose, { Schema, Document, Types } from 'mongoose';
import { ILocation } from '../types/location.types.js';

export interface LocationDocument
  extends Omit<ILocation, '_id' | 'createdAt' | 'updatedAt' | 'groupId' | 'groupIds'>, Document {
  _id: Types.ObjectId;
  /** Legacy membership, merged into groupIds on the next membership write. */
  groupId?: Types.ObjectId;
  groupIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema<LocationDocument>(
  {
    storeName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    squareLocationId: {
      type: String,
      required: true,
      trim: true,
    },
    squareMerchantId: {
      type: String,
      required: false,
      trim: true,
      default: undefined,
    },
    homebaseLocationId: {
      type: String,
      required: true,
      trim: true,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
    },
    businessStartTime: {
      type: String,
      required: true,
      trim: true,
    },
    squareAccessTokenEnc: {
      type: String,
      required: false,
      default: undefined,
    },
    homebaseApiKeyEnc: {
      type: String,
      required: false,
      default: undefined,
    },
    /** AES-GCM encrypted Square webhook signature key for this location (multi-Square apps). */
    squareWebhookSignatureKeyEnc: {
      type: String,
      required: false,
      default: undefined,
    },
    logoId: {
      type: Schema.Types.ObjectId,
      ref: 'Logo',
      required: false,
      default: undefined,
    },
    marketManBuyerGuid: {
      type: String,
      required: false,
      trim: true,
      default: undefined,
    },
    googleBusinessAccountId: {
      type: String,
      required: false,
      trim: true,
      default: undefined,
    },
    googleBusinessLocationId: {
      type: String,
      required: false,
      trim: true,
      default: undefined,
    },
    /** Global display order (ascending) for admin lists and navbar dropdowns. */
    sortOrder: {
      type: Number,
      required: true,
      default: 0,
    },
    /** Legacy single-group field, retained for existing location documents. */
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'LocationGroup',
      required: false,
      default: undefined,
    },
    /** A location may appear under every group it belongs to. */
    groupIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'LocationGroup' }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

locationSchema.index({ sortOrder: 1 });
// Keep the legacy index while existing membership is converted on write.
locationSchema.index({ groupId: 1, sortOrder: 1 });
locationSchema.index({ groupIds: 1, sortOrder: 1 });
locationSchema.index({ createdAt: -1 });

export const LocationModel = mongoose.model<LocationDocument>('Location', locationSchema);
