import { ReviewSettingsModel } from "../models/reviewSettings.model.js";
import type { IReviewSettings } from "../types/reviewSettings.types.js";

export class ReviewSettingsService {
  async get(): Promise<IReviewSettings | null> {
    const doc = await ReviewSettingsModel.findOne()
      .populate("employeeRoleIds", "name")
      .populate("managerRoleIds", "name")
      .populate("directorRoleIds", "name")
      .lean();
    return doc as IReviewSettings | null;
  }

  async upsert(data: Partial<IReviewSettings>): Promise<IReviewSettings> {
    const existing = await ReviewSettingsModel.findOne();

    const hasQuestionnaires =
      (data.selfReviewQuestionnaire?.length ?? existing?.selfReviewQuestionnaire?.length ?? 0) > 0 &&
      (data.managerReviewQuestionnaire?.length ?? existing?.managerReviewQuestionnaire?.length ?? 0) > 0;
    const hasRoles =
      (data.employeeRoleIds?.length ?? existing?.employeeRoleIds?.length ?? 0) > 0 &&
      (data.managerRoleIds?.length ?? existing?.managerRoleIds?.length ?? 0) > 0 &&
      (data.directorRoleIds?.length ?? existing?.directorRoleIds?.length ?? 0) > 0;

    const isConfigured = hasQuestionnaires && hasRoles;

    if (existing) {
      Object.assign(existing, data, { isConfigured });
      await existing.save();
      return existing.toObject() as unknown as IReviewSettings;
    }

    const doc = await ReviewSettingsModel.create({ ...data, isConfigured });
    return doc.toObject() as unknown as IReviewSettings;
  }

  async getRaw(): Promise<IReviewSettings | null> {
    const doc = await ReviewSettingsModel.findOne().lean();
    return doc as IReviewSettings | null;
  }
}
