import type { ICreateTrainingPayload, ITrainingResponse } from '../types/training.types.js';
import { TrainingModel } from '../models/training.model.js';

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
}
