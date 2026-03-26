import { DisciplinarySettingsRepository } from "../repositories/disciplinarySettings.repository.js";
import type { IDisciplinarySettings } from "../types/disciplinary.types.js";

const repo = new DisciplinarySettingsRepository();

export class DisciplinarySettingsService {
  async get(): Promise<IDisciplinarySettings | null> {
    return repo.findOne() as Promise<IDisciplinarySettings | null>;
  }

  async upsert(
    data: Partial<IDisciplinarySettings>,
  ): Promise<IDisciplinarySettings> {
    const hasSections = (data.policySections?.length ?? 0) > 0;
    const hasGuidelines = (data.disciplineGuidelines?.length ?? 0) > 0;
    const hasSystemRules =
      (data.rollingPeriodDays ?? 0) > 0 &&
      (data.pointsToTermination ?? 0) > 0;

    const isConfigured = hasSections && hasGuidelines && hasSystemRules;

    const doc = await repo.upsert({ ...data, isConfigured });
    return doc as unknown as IDisciplinarySettings;
  }
}
