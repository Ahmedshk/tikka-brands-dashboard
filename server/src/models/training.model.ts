import mongoose, { Schema, Document, Types } from 'mongoose';
import type { ITrainingModule, ITrainingModuleFile, AssignToRoles } from '../types/training.types.js';

const trainingModuleFileSchema = new Schema<ITrainingModuleFile>(
  {
    publicId: { type: String, required: true, trim: true },
    resourceType: { type: String, enum: ['image', 'raw'], required: true },
  },
  { _id: false }
);

const trainingModuleSchema = new Schema<ITrainingModule>(
  {
    name: { type: String, required: true, trim: true },
    moduleFiles: {
      type: [trainingModuleFileSchema],
      default: [],
      required: true,
    },
  },
  { _id: false }
);

export interface TrainingDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  modules: ITrainingModule[];
  assignToRoles?: AssignToRoles;
  createdAt: Date;
  updatedAt: Date;
}

const trainingSchema = new Schema<TrainingDocument>(
  {
    name: { type: String, required: true, trim: true },
    modules: {
      type: [trainingModuleSchema],
      default: [],
      required: true,
    },
    assignToRoles: {
      type: Schema.Types.Mixed,
      required: false,
      validate: {
        validator(v: unknown) {
          if (v == null) return true;
          if (v === 'all') return true;
          return Array.isArray(v) && v.every((id) => typeof id === 'string');
        },
        message: 'assignToRoles must be "all" or an array of role IDs',
      },
    },
  },
  { timestamps: true }
);

export const TrainingModel = mongoose.model<TrainingDocument>('Training', trainingSchema);
