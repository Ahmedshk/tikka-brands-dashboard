import { LocationRepository } from '../repositories/location.repository.js';
import { ILocation } from '../types/location.types.js';
import { NotFoundError } from '../utils/errors.util.js';

export class LocationService {
  private readonly locationRepository: LocationRepository;

  constructor() {
    this.locationRepository = new LocationRepository();
  }

  async create(data: Omit<ILocation, '_id' | 'createdAt' | 'updatedAt'>): Promise<ILocation> {
    const doc = await this.locationRepository.create(data);
    return this.toLocation(doc);
  }

  async getById(id: string): Promise<ILocation | null> {
    const doc = await this.locationRepository.findById(id);
    return doc ? this.toLocation(doc) : null;
  }

  async getAll(): Promise<ILocation[]> {
    const docs = await this.locationRepository.findAll();
    return docs.map((d) => this.toLocation(d));
  }

  async getPaginated(page: number, limit: number): Promise<{ locations: ILocation[]; total: number; page: number; limit: number; totalPages: number }> {
    const [docs, total] = await Promise.all([
      this.locationRepository.findPaginated((page - 1) * limit, limit),
      this.locationRepository.count(),
    ]);
    const totalPages = Math.ceil(total / limit) || 1;
    return {
      locations: docs.map((d) => this.toLocation(d)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async update(id: string, data: Partial<Omit<ILocation, '_id' | 'createdAt' | 'updatedAt'>>): Promise<ILocation> {
    const doc = await this.locationRepository.updateById(id, data);
    if (!doc) {
      throw new NotFoundError('Location not found');
    }
    return this.toLocation(doc);
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.locationRepository.deleteById(id);
    if (!deleted) {
      throw new NotFoundError('Location not found');
    }
  }

  private toLocation(doc: {
    _id: unknown;
    storeName: string;
    address: string;
    squareLocationId: string;
    homebaseLocationId?: string;
    timezone?: string;
    businessStartTime?: string;
    createdAt: Date;
    updatedAt: Date;
  }): ILocation {
    return {
      _id: String(doc._id),
      storeName: doc.storeName,
      address: doc.address,
      squareLocationId: doc.squareLocationId,
      homebaseLocationId: doc.homebaseLocationId ?? "",
      timezone: doc.timezone ?? "",
      businessStartTime: doc.businessStartTime ?? "00:00",
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
