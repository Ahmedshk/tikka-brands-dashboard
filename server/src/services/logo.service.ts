import { LogoRepository } from '../repositories/logo.repository.js';
import type { ILogoResponse } from '../types/logo.types.js';

const MAX_DATA_URL_LENGTH = 500 * 1024; // 500KB
const DATA_URL_REGEX = /^data:image\/[a-zA-Z+.-]+;base64,/;

function validateDataUrl(dataUrl: string): void {
  if (typeof dataUrl !== 'string' || dataUrl.trim().length === 0) {
    throw new Error('dataUrl is required');
  }
  if (!DATA_URL_REGEX.test(dataUrl)) {
    throw new Error('dataUrl must be a base64 image data URL (data:image/...;base64,...)');
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error(`Logo size must not exceed ${MAX_DATA_URL_LENGTH / 1024}KB`);
  }
}

export class LogoService {
  private readonly logoRepository: LogoRepository;

  constructor() {
    this.logoRepository = new LogoRepository();
  }

  async create(dataUrl: string): Promise<ILogoResponse> {
    validateDataUrl(dataUrl);
    const doc = await this.logoRepository.create({ dataUrl });
    return this.toLogoResponse(doc);
  }

  async getById(id: string): Promise<ILogoResponse | null> {
    const doc = await this.logoRepository.findById(id);
    return doc ? this.toLogoResponse(doc) : null;
  }

  /** One round-trip for many logo data URLs (dedupe `ids` before calling if needed). */
  async getDataUrlByIdMap(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const docs = await this.logoRepository.findByIds(unique);
    for (const d of docs) {
      if (typeof d.dataUrl === 'string' && d.dataUrl.length > 0) {
        map.set(String(d._id), d.dataUrl);
      }
    }
    return map;
  }

  async getAll(): Promise<ILogoResponse[]> {
    const docs = await this.logoRepository.findAll();
    return docs.map((d) => this.toLogoResponse(d));
  }

  private toLogoResponse(doc: { _id: unknown; dataUrl: string; contentType?: string | undefined; createdAt: Date; updatedAt: Date }): ILogoResponse {
    return {
      _id: String(doc._id),
      dataUrl: doc.dataUrl,
      ...(doc.contentType != null && { contentType: doc.contentType }),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
