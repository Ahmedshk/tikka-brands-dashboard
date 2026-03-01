import { LogoModel, LogoDocument } from '../models/logo.model.js';
import { ILogo } from '../types/logo.types.js';

const LIST_LIMIT = 50;

export class LogoRepository {
  async create(data: Omit<ILogo, '_id' | 'createdAt' | 'updatedAt'>): Promise<LogoDocument> {
    const logo = new LogoModel(data);
    return await logo.save();
  }

  async findById(id: string): Promise<LogoDocument | null> {
    return await LogoModel.findById(id).lean().exec() as LogoDocument | null;
  }

  async findAll(limit = LIST_LIMIT): Promise<LogoDocument[]> {
    return await LogoModel.find().sort({ createdAt: -1 }).limit(limit).lean().exec() as LogoDocument[];
  }
}
