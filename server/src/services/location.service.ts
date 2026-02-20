import { LocationRepository } from '../repositories/location.repository.js';
import { LogoService } from './logo.service.js';
import { ILocation, ILocationResponse } from '../types/location.types.js';
import { NotFoundError } from '../utils/errors.util.js';
import { encryptCredentials, decryptCredentials } from '../utils/credentialsEncryption.util.js';

export type CreateLocationData = Omit<ILocation, '_id' | 'createdAt' | 'updatedAt' | 'squareAccessTokenEnc' | 'homebaseApiKeyEnc'> & {
  squareAccessToken: string;
  homebaseApiKey: string;
};

export type UpdateLocationData = Partial<Omit<ILocation, '_id' | 'createdAt' | 'updatedAt' | 'squareAccessTokenEnc' | 'homebaseApiKeyEnc'>> & {
  squareAccessToken?: string;
  homebaseApiKey?: string;
  logoId?: string | null;
};

export interface LocationWithCredentials {
  location: ILocationResponse;
  squareAccessToken: string | null;
  homebaseApiKey: string | null;
}

export class LocationService {
  private readonly locationRepository: LocationRepository;
  private readonly logoService: LogoService;

  constructor() {
    this.locationRepository = new LocationRepository();
    this.logoService = new LogoService();
  }

  async create(data: CreateLocationData): Promise<ILocationResponse> {
    const squareAccessTokenEnc = encryptCredentials(data.squareAccessToken);
    const homebaseApiKeyEnc = encryptCredentials(data.homebaseApiKey);
    const doc = await this.locationRepository.create({
      storeName: data.storeName,
      address: data.address,
      squareLocationId: data.squareLocationId,
      homebaseLocationId: data.homebaseLocationId,
      timezone: data.timezone,
      businessStartTime: data.businessStartTime,
      squareAccessTokenEnc,
      homebaseApiKeyEnc,
      ...(data.logoId && { logoId: data.logoId }),
      ...(data.marketManBuyerGuid != null && data.marketManBuyerGuid !== '' && { marketManBuyerGuid: data.marketManBuyerGuid.trim() }),
    } as Omit<ILocation, '_id' | 'createdAt' | 'updatedAt'>);
    return this.enrichWithLogo(this.toLocationResponse(doc), doc.logoId);
  }

  async getById(id: string): Promise<ILocationResponse | null> {
    const doc = await this.locationRepository.findById(id);
    if (!doc) return null;
    return this.enrichWithLogo(this.toLocationResponse(doc), doc.logoId);
  }

  async getByIdWithCredentials(id: string): Promise<LocationWithCredentials | null> {
    const doc = await this.locationRepository.findById(id);
    if (!doc) return null;
    const squareAccessToken = doc.squareAccessTokenEnc
      ? decryptCredentials(doc.squareAccessTokenEnc)
      : null;
    const homebaseApiKey = doc.homebaseApiKeyEnc
      ? decryptCredentials(doc.homebaseApiKeyEnc)
      : null;
    const location = await this.enrichWithLogo(this.toLocationResponse(doc), doc.logoId);
    return {
      location,
      squareAccessToken,
      homebaseApiKey,
    };
  }

  async getAll(): Promise<ILocationResponse[]> {
    const docs = await this.locationRepository.findAll();
    const responses = docs.map((d) => this.toLocationResponse(d));
    return Promise.all(responses.map((r, i) => this.enrichWithLogo(r, docs[i]?.logoId)));
  }

  async getPaginated(
    page: number,
    limit: number,
  ): Promise<{ locations: ILocationResponse[]; total: number; page: number; limit: number; totalPages: number }> {
    const [docs, total] = await Promise.all([
      this.locationRepository.findPaginated((page - 1) * limit, limit),
      this.locationRepository.count(),
    ]);
    const totalPages = Math.ceil(total / limit) || 1;
    const responses = docs.map((d) => this.toLocationResponse(d));
    const locations = await Promise.all(responses.map((r, i) => this.enrichWithLogo(r, docs[i]?.logoId)));
    return {
      locations,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async update(id: string, data: UpdateLocationData): Promise<ILocationResponse> {
    const { squareAccessToken, homebaseApiKey, ...rest } = data;
    const updatePayload: Parameters<LocationRepository['updateById']>[1] = { ...rest };
    const squareTrim = squareAccessToken?.trim();
    const homebaseTrim = homebaseApiKey?.trim();
    if (squareTrim) {
      updatePayload.squareAccessTokenEnc = encryptCredentials(squareTrim);
    }
    if (homebaseTrim) {
      updatePayload.homebaseApiKeyEnc = encryptCredentials(homebaseTrim);
    }
    if (data.logoId !== undefined) {
      (updatePayload as { logoId?: string | null }).logoId = data.logoId === null || data.logoId === '' ? null : data.logoId;
    }
    const doc = await this.locationRepository.updateById(id, updatePayload);
    if (!doc) {
      throw new NotFoundError('Location not found');
    }
    return this.enrichWithLogo(this.toLocationResponse(doc), doc.logoId);
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.locationRepository.deleteById(id);
    if (!deleted) {
      throw new NotFoundError('Location not found');
    }
  }

  private toLocationResponse(doc: {
    _id: unknown;
    storeName: string;
    address: string;
    squareLocationId: string;
    homebaseLocationId?: string;
    timezone?: string;
    businessStartTime?: string;
    squareAccessTokenEnc?: string;
    homebaseApiKeyEnc?: string;
    logoId?: unknown;
    marketManBuyerGuid?: string;
    createdAt: Date;
    updatedAt: Date;
  }): ILocationResponse {
    return {
      _id: String(doc._id),
      storeName: doc.storeName,
      address: doc.address,
      squareLocationId: doc.squareLocationId,
      homebaseLocationId: doc.homebaseLocationId ?? '',
      timezone: doc.timezone ?? '',
      businessStartTime: doc.businessStartTime ?? '00:00',
      hasSquareAccessToken: Boolean(doc.squareAccessTokenEnc),
      hasHomebaseApiKey: Boolean(doc.homebaseApiKeyEnc),
      ...(doc.logoId != null && { logoId: String(doc.logoId) }),
      ...(doc.marketManBuyerGuid != null && doc.marketManBuyerGuid !== '' && { marketManBuyerGuid: doc.marketManBuyerGuid }),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private async enrichWithLogo(
    response: ILocationResponse,
    logoId: unknown
  ): Promise<ILocationResponse> {
    if (logoId == null) return response;
    const logo = await this.logoService.getById(String(logoId));
    if (logo) {
      return { ...response, logoDataUrl: logo.dataUrl };
    }
    return response;
  }
}
