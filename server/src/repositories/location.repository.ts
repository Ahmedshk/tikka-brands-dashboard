import type { UpdateQuery } from 'mongoose';
import { LocationModel, LocationDocument } from '../models/location.model.js';
import { ILocation } from '../types/location.types.js';

export class LocationRepository {
  async create(data: Omit<ILocation, '_id' | 'createdAt' | 'updatedAt'>): Promise<LocationDocument> {
    const location = new LocationModel(data);
    return await location.save();
  }

  async findById(id: string): Promise<LocationDocument | null> {
    return await LocationModel.findById(id).lean().exec() as LocationDocument | null;
  }

  async findAll(): Promise<LocationDocument[]> {
    return await LocationModel.find().sort({ createdAt: -1 }).lean().exec() as LocationDocument[];
  }

  async findPaginated(skip: number, limit: number): Promise<LocationDocument[]> {
    return await LocationModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec() as LocationDocument[];
  }

  async count(): Promise<number> {
    return await LocationModel.countDocuments();
  }

  async updateById(
    id: string,
    updateData: UpdateQuery<LocationDocument> | Partial<Omit<ILocation, '_id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<LocationDocument | null> {
    return await LocationModel.findByIdAndUpdate(id, updateData, { new: true }).lean().exec() as LocationDocument | null;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await LocationModel.findByIdAndDelete(id);
    return result !== null;
  }

  async findBySquareLocationId(squareLocationId: string): Promise<LocationDocument | null> {
    return await LocationModel.findOne({ squareLocationId: squareLocationId.trim() })
      .lean()
      .exec() as LocationDocument | null;
  }

  async findBySquareMerchantId(squareMerchantId: string): Promise<LocationDocument | null> {
    return await LocationModel.findOne({ squareMerchantId: squareMerchantId.trim() })
      .lean()
      .exec() as LocationDocument | null;
  }

  async findByMarketManBuyerGuid(buyerGuid: string): Promise<LocationDocument | null> {
    return await LocationModel.findOne({ marketManBuyerGuid: buyerGuid.trim() })
      .lean()
      .exec() as LocationDocument | null;
  }
}
