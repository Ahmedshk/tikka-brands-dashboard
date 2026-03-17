import { Types } from 'mongoose';
import { TrainingAssignmentModel, TrainingAssignmentDocument } from '../models/trainingAssignment.model.js';
import type { IModuleProgressEntry } from '../types/trainingAssignment.types.js';

export class TrainingAssignmentRepository {
  async create(data: {
    userId: Types.ObjectId;
    trainingId: Types.ObjectId;
    assignedAt: Date;
    assignedBy?: Types.ObjectId;
    moduleProgress: IModuleProgressEntry[];
  }): Promise<TrainingAssignmentDocument> {
    const doc = new TrainingAssignmentModel(data);
    return await doc.save();
  }

  async createMany(
    items: Array<{
      userId: Types.ObjectId;
      trainingId: Types.ObjectId;
      assignedAt: Date;
      assignedBy?: Types.ObjectId;
      moduleProgress: IModuleProgressEntry[];
    }>
  ): Promise<TrainingAssignmentDocument[]> {
    const created = await TrainingAssignmentModel.insertMany(items);
    return created as TrainingAssignmentDocument[];
  }

  async findById(id: string): Promise<TrainingAssignmentDocument | null> {
    return await TrainingAssignmentModel.findById(id).lean().exec() as TrainingAssignmentDocument | null;
  }

  async findByUserIdIn(userIds: string[]): Promise<TrainingAssignmentDocument[]> {
    if (userIds.length === 0) return [];
    const objectIds = userIds
      .filter(Boolean)
      .map((id) => new Types.ObjectId(id));
    return await TrainingAssignmentModel.find({ userId: { $in: objectIds } })
      .sort({ assignedAt: -1 })
      .lean()
      .exec() as TrainingAssignmentDocument[];
  }

  async updateById(
    id: string,
    update: { moduleProgress: IModuleProgressEntry[] }
  ): Promise<TrainingAssignmentDocument | null> {
    return await TrainingAssignmentModel.findByIdAndUpdate(
      id,
      { $set: { moduleProgress: update.moduleProgress } },
      { new: true, runValidators: true }
    )
      .lean()
      .exec() as TrainingAssignmentDocument | null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await TrainingAssignmentModel.findByIdAndDelete(id);
    return result != null;
  }
}
