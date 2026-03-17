import mongoose, { Schema, Document, Types } from 'mongoose';
import type { IModuleProgressEntry, IAssignmentExtraFile } from '../types/trainingAssignment.types.js';

const extraFileSchema = new Schema<IAssignmentExtraFile>(
  {
    publicId: { type: String, required: true, trim: true },
    resourceType: { type: String, enum: ['image', 'raw'], required: true },
    filename: { type: String, required: false, trim: true },
    format: { type: String, required: false, trim: true },
  },
  { _id: false }
);

const moduleProgressEntrySchema = new Schema<IModuleProgressEntry>(
  {
    completedAt: { type: Date, required: false, default: null },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      required: true,
      default: 'not_started',
    },
    managerNotes: { type: String, required: false, trim: true },
    extraFiles: { type: [extraFileSchema], default: [], required: false },
  },
  { _id: false }
);

export interface TrainingAssignmentDocument extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  trainingId: Types.ObjectId;
  assignedAt: Date;
  assignedBy?: Types.ObjectId;
  moduleProgress: IModuleProgressEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const trainingAssignmentSchema = new Schema<TrainingAssignmentDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    trainingId: { type: Schema.Types.ObjectId, ref: 'Training', required: true },
    assignedAt: { type: Date, required: true, default: () => new Date() },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    moduleProgress: {
      type: [moduleProgressEntrySchema],
      default: [],
      required: true,
    },
  },
  { timestamps: true }
);

trainingAssignmentSchema.index({ userId: 1, trainingId: 1 }, { unique: true });

export const TrainingAssignmentModel = mongoose.model<TrainingAssignmentDocument>(
  'TrainingAssignment',
  trainingAssignmentSchema
);
