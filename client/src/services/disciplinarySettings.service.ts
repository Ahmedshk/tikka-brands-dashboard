import api from "./api.service";

export interface DisciplinaryPolicy {
  id: string;
  title: string;
  description: string;
  points: number;
}

export interface DisciplinaryPolicySection {
  id: string;
  name: string;
  order: number;
  policies: DisciplinaryPolicy[];
}

export interface ImmediateTerminationPolicy {
  id: string;
  title: string;
  description: string;
}

export interface DisciplineGuideline {
  id: string;
  pointThreshold: number;
  action: string;
}

export interface DisciplinarySettings {
  _id?: string;
  rollingPeriodDays: number;
  pointsToTermination: number;
  policySections: DisciplinaryPolicySection[];
  immediateTerminationPolicies: ImmediateTerminationPolicy[];
  disciplineGuidelines: DisciplineGuideline[];
  isConfigured: boolean;
}

export const disciplinarySettingsService = {
  async getSettings(): Promise<DisciplinarySettings | null> {
    const { data } = await api.get("/disciplinary/settings");
    return data.data;
  },

  async updateSettings(
    settings: Omit<DisciplinarySettings, "_id" | "isConfigured">,
  ): Promise<DisciplinarySettings> {
    const { data } = await api.put("/disciplinary/settings", settings);
    return data.data;
  },
};
