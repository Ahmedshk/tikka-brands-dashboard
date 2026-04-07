import type { UpdateQuery } from 'mongoose';
import { LocationRepository } from '../repositories/location.repository.js';
import type { LocationDocument } from '../models/location.model.js';
import { LogoService } from './logo.service.js';
import {
  ILocation,
  ILocationResponse,
  type CreateLocationData,
  type UpdateLocationData,
  type LocationWithCredentials,
} from '../types/location.types.js';
import { NotFoundError } from '../utils/errors.util.js';
import { encryptCredentials, decryptCredentials } from '../utils/credentialsEncryption.util.js';

/** Safely coerce logoId (string, ObjectId, or populated doc) to string for API response. */
function toLogoIdString(val: unknown): string | undefined {
  if (val == null) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null) {
    if ('_id' in val) return String((val as { _id: unknown })._id);
    const customToString = (val as { toString?: () => string }).toString;
    if (typeof customToString === 'function') {
      const s = customToString.call(val);
      if (s && s !== '[object Object]') return s;
    }
    return undefined;
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return undefined;
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
      ...(data.squareMerchantId != null &&
      String(data.squareMerchantId).trim() !== ""
        ? { squareMerchantId: String(data.squareMerchantId).trim() }
        : {}),
      homebaseLocationId: data.homebaseLocationId,
      timezone: data.timezone,
      businessStartTime: data.businessStartTime,
      squareAccessTokenEnc,
      homebaseApiKeyEnc,
      ...(data.squareWebhookSignatureKey?.trim()
        ? {
            squareWebhookSignatureKeyEnc: encryptCredentials(
              data.squareWebhookSignatureKey.trim(),
            ),
          }
        : {}),
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
    const { squareAccessToken, homebaseApiKey, squareWebhookSignatureKey, ...rest } = data;
    const $set: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) $set[key] = value;
    }
    const squareTrim = squareAccessToken?.trim();
    const homebaseTrim = homebaseApiKey?.trim();
    if (squareTrim) {
      $set.squareAccessTokenEnc = encryptCredentials(squareTrim);
    }
    if (homebaseTrim) {
      $set.homebaseApiKeyEnc = encryptCredentials(homebaseTrim);
    }
    if (data.logoId !== undefined) {
      $set.logoId = data.logoId === null || data.logoId === '' ? null : data.logoId;
    }
    const $unset: Record<string, 1> = {};
    if (squareWebhookSignatureKey !== undefined) {
      const w = squareWebhookSignatureKey.trim();
      if (w === '') {
        $unset.squareWebhookSignatureKeyEnc = 1;
      } else {
        $set.squareWebhookSignatureKeyEnc = encryptCredentials(w);
      }
    }
    const updateQuery: UpdateQuery<LocationDocument> = {};
    if (Object.keys($set).length > 0) updateQuery.$set = $set;
    if (Object.keys($unset).length > 0) updateQuery.$unset = $unset;
    if (Object.keys(updateQuery).length === 0) {
      const existing = await this.locationRepository.findById(id);
      if (!existing) {
        throw new NotFoundError('Location not found');
      }
      return this.enrichWithLogo(this.toLocationResponse(existing), existing.logoId);
    }
    const doc = await this.locationRepository.updateById(id, updateQuery);
    if (!doc) {
      throw new NotFoundError('Location not found');
    }
    return this.enrichWithLogo(this.toLocationResponse(doc), doc.logoId);
  }

  /**
   * All active Square webhook signature keys: optional legacy env key first, then each
   * location's decrypted per-location key (for POST /api/webhooks/square verification).
   */
  async getAllSquareWebhookSignatureKeysForVerification(): Promise<string[]> {
    const keys: string[] = [];
    const globalKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim();
    if (globalKey) keys.push(globalKey);
    const docs = await this.locationRepository.findAll();
    for (const d of docs) {
      if (!d.squareWebhookSignatureKeyEnc) continue;
      const k = decryptCredentials(d.squareWebhookSignatureKeyEnc);
      if (k) keys.push(k);
    }
    return keys;
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
    squareMerchantId?: string;
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
      ...(doc.squareMerchantId != null && doc.squareMerchantId !== ''
        ? { squareMerchantId: doc.squareMerchantId }
        : {}),
      homebaseLocationId: doc.homebaseLocationId ?? '',
      timezone: doc.timezone ?? '',
      businessStartTime: doc.businessStartTime ?? '00:00',
      hasSquareAccessToken: Boolean(doc.squareAccessTokenEnc),
      hasHomebaseApiKey: Boolean(doc.homebaseApiKeyEnc),
      hasSquareWebhookSignatureKey: Boolean(doc.squareWebhookSignatureKeyEnc),
      ...(() => {
        const id = toLogoIdString(doc.logoId);
        return id == null ? {} : { logoId: id };
      })(),
      ...(doc.marketManBuyerGuid != null && doc.marketManBuyerGuid !== '' && { marketManBuyerGuid: doc.marketManBuyerGuid }),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private async enrichWithLogo(
    response: ILocationResponse,
    logoId: unknown
  ): Promise<ILocationResponse> {
    const logoIdStr = toLogoIdString(logoId);
    if (logoIdStr) {
      const logo = await this.logoService.getById(logoIdStr);
      return logo ? { ...response, logoDataUrl: logo.dataUrl } : response;
    }
    return response;
  }
}
