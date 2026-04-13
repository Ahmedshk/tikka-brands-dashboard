import mongoose from 'mongoose';
import { LogoModel, LogoDocument } from '../models/logo.model.js';
import { ILogo } from '../types/logo.types.js';

const LIST_LIMIT = 50;

function toValidObjectIds(ids: string[]): mongoose.Types.ObjectId[] {
  const out: mongoose.Types.ObjectId[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (mongoose.Types.ObjectId.isValid(id)) {
      out.push(new mongoose.Types.ObjectId(id));
    }
  }
  return out;
}

export class LogoRepository {
  async create(data: Omit<ILogo, '_id' | 'createdAt' | 'updatedAt'>): Promise<LogoDocument> {
    const logo = new LogoModel(data);
    return await logo.save();
  }

  async findById(id: string): Promise<LogoDocument | null> {
    return await LogoModel.findById(id).lean().exec() as LogoDocument | null;
  }

  async findByIds(ids: string[]): Promise<Array<{ _id: unknown; url: string }>> {
    const oids = toValidObjectIds(ids);
    if (oids.length === 0) return [];
    return (await LogoModel.find({ _id: { $in: oids } })
      .select({ url: 1 })
      .lean()
      .exec()) as Array<{ _id: unknown; url: string }>;
  }

  async findAll(limit = LIST_LIMIT): Promise<LogoDocument[]> {
    return await LogoModel.find().sort({ createdAt: -1 }).limit(limit).lean().exec() as LogoDocument[];
  }
}
