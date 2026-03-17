import type {
  ICreateTrainingPayload,
  ITrainingResponse,
  ITrainingModuleFile,
} from '../types/training.types.js';
import { TrainingModel } from '../models/training.model.js';
import { deleteFromCloudinary } from '../config/cloudinary.js';

function toResponse(doc: {
  _id: { toString: () => string };
  name: string;
  modules: ICreateTrainingPayload['modules'];
  assignToRoles?: ICreateTrainingPayload['assignToRoles'];
  createdAt: Date;
  updatedAt: Date;
}): ITrainingResponse {
  return {
    _id: doc._id.toString(),
    name: doc.name,
    modules: doc.modules,
    ...(doc.assignToRoles != null && { assignToRoles: doc.assignToRoles }),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class TrainingService {
  async create(payload: ICreateTrainingPayload): Promise<ITrainingResponse> {
    const doc = await TrainingModel.create({
      name: payload.name,
      modules: payload.modules,
      ...(payload.assignToRoles != null && { assignToRoles: payload.assignToRoles }),
    });
    return toResponse(doc);
  }

  async list(): Promise<ITrainingResponse[]> {
    const docs = await TrainingModel.find().sort({ createdAt: -1 }).lean();
    return docs.map((d) =>
      toResponse({
        _id: d._id,
        name: d.name,
        modules: d.modules,
        assignToRoles: d.assignToRoles,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })
    );
  }

  async getById(id: string): Promise<ITrainingResponse | null> {
    const doc = await TrainingModel.findById(id).lean();
    if (!doc) return null;
    return toResponse({
      _id: doc._id,
      name: doc.name,
      modules: doc.modules,
      assignToRoles: doc.assignToRoles,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async update(
    id: string,
    payload: ICreateTrainingPayload
  ): Promise<ITrainingResponse | null> {
    const existing = await TrainingModel.findById(id).lean();
    if (!existing) return null;

    const newFileKeys = new Set(
      payload.modules.flatMap((m) =>
        (m.moduleFiles ?? []).map((f) => `${f.publicId}\0${f.resourceType}`)
      )
    );
    const toDelete: ITrainingModuleFile[] = (existing.modules ?? []).flatMap(
      (m) =>
        (m.moduleFiles ?? []).filter(
          (f) => !newFileKeys.has(`${f.publicId}\0${f.resourceType}`)
        )
    );
    await Promise.all(
      toDelete.map((f) =>
        deleteFromCloudinary(f.publicId, f.resourceType).catch(() => {})
      )
    );

    const doc = await TrainingModel.findByIdAndUpdate(
      id,
      {
        name: payload.name,
        modules: payload.modules,
        ...(payload.assignToRoles != null && { assignToRoles: payload.assignToRoles }),
      },
      { new: true, runValidators: true }
    ).lean();
    if (!doc) return null;
    return toResponse({
      _id: doc._id,
      name: doc.name,
      modules: doc.modules,
      assignToRoles: doc.assignToRoles,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await TrainingModel.findByIdAndDelete(id);
    return result != null;
  }
}
