import mongoose, { Schema, Document, Types } from 'mongoose';
import { ILocation } from '../types/location.types.js';

export interface LocationDocument
  extends Omit<ILocation, '_id' | 'createdAt' | 'updatedAt' | 'groupId'>, Document {
  _id: Types.ObjectId;
  /**
   * Stored as an ObjectId ref. `ILocation` types this as a string because that
   * is the form the API emits, so it is re-declared here to keep Mongoose query
   * typings (`{ groupId: ObjectId }`) valid.
   */
  groupId?: Types.ObjectId;
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
    /**
     * Optional group this location is bucketed under in the header location
     * selector. Null/absent means the location falls into the "Ungrouped"
     * section. A location belongs to at most one group.
     */
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'LocationGroup',
      required: false,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

locationSchema.index({ sortOrder: 1 });
// Group buckets read by sortOrder within each group; groupId leading also serves
// the membership lookups that resolve a group's member list.
locationSchema.index({ groupId: 1, sortOrder: 1 });
locationSchema.index({ createdAt: -1 });

export const LocationModel = mongoose.model<LocationDocument>('Location', locationSchema);
