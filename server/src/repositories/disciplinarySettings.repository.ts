import {
  DisciplinarySettingsModel,
  type DisciplinarySettingsDocument,
} from "../models/disciplinarySettings.model.js";
import type { IDisciplinarySettings } from "../types/disciplinary.types.js";

export class DisciplinarySettingsRepository {
  async findOne(): Promise<DisciplinarySettingsDocument | null> {
    return DisciplinarySettingsModel.findOne().lean() as Promise<DisciplinarySettingsDocument | null>;
  }

  async upsert(
    data: Partial<IDisciplinarySettings>,
  ): Promise<DisciplinarySettingsDocument> {
    const existing = await DisciplinarySettingsModel.findOne();

    if (existing) {
      Object.assign(existing, data);
      await existing.save();
      return existing.toObject() as unknown as DisciplinarySettingsDocument;
    }

    const doc = await DisciplinarySettingsModel.create(data);
    return doc.toObject() as unknown as DisciplinarySettingsDocument;
  }
}
