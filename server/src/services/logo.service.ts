import { LogoRepository } from '../repositories/logo.repository.js';
import type { ILogoResponse } from '../types/logo.types.js';

export class LogoService {
  private readonly logoRepository: LogoRepository;

  constructor() {
    this.logoRepository = new LogoRepository();
  }

  async create(url: string, publicId: string, name?: string): Promise<ILogoResponse> {
    const doc = await this.logoRepository.create({ url, publicId, ...(name ? { name } : {}) });
    return this.toLogoResponse(doc);
  }

  async getById(id: string): Promise<ILogoResponse | null> {
    const doc = await this.logoRepository.findById(id);
    return doc ? this.toLogoResponse(doc) : null;
  }

  /** One round-trip for many logo URLs (dedupe `ids` before calling if needed). */
  async getUrlByIdMap(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
    const map = new Map<string, string>();
    if (unique.length === 0) return map;
    const docs = await this.logoRepository.findByIds(unique);
    for (const d of docs) {
      if (typeof d.url === 'string' && d.url.length > 0) {
        map.set(String(d._id), d.url);
      }
    }
    return map;
  }

  async getAll(): Promise<ILogoResponse[]> {
    const docs = await this.logoRepository.findAll();
    return docs.map((d) => this.toLogoResponse(d));
  }

  private toLogoResponse(doc: { _id: unknown; url: string; publicId: string; name?: string; createdAt: Date; updatedAt: Date }): ILogoResponse {
    return {
      _id: String(doc._id),
      url: doc.url,
      publicId: doc.publicId,
      ...(doc.name != null && { name: doc.name }),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
