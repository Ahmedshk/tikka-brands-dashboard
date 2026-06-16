import type {
  DisciplinaryPolicySection,
  ImmediateTerminationPolicy,
  DisciplineGuideline,
} from '../services/disciplinarySettings.service';

export const DEFAULT_DISCIPLINARY_ROLLING_PERIOD_DAYS = 90;
export const DEFAULT_DISCIPLINARY_POINTS_TO_TERMINATION = 15;

export interface DisciplinarySettingsSnapshot {
  rollingPeriodDays: number;
  pointsToTermination: number;
  policySections: DisciplinaryPolicySection[];
  immediateTerminationPolicies: ImmediateTerminationPolicy[];
  disciplineGuidelines: DisciplineGuideline[];
}

export function sortDisciplineGuidelinesByThreshold(
  list: DisciplineGuideline[],
): DisciplineGuideline[] {
  return [...list].sort((a, b) => a.pointThreshold - b.pointThreshold);
}

export function buildDisciplinarySettingsSnapshot(
  rollingPeriodDays: number,
  pointsToTermination: number,
  policySections: DisciplinaryPolicySection[],
  immediateTerminationPolicies: ImmediateTerminationPolicy[],
  disciplineGuidelines: DisciplineGuideline[],
): DisciplinarySettingsSnapshot {
  return {
    rollingPeriodDays,
    pointsToTermination,
    policySections: structuredClone(policySections),
    immediateTerminationPolicies: structuredClone(immediateTerminationPolicies),
    disciplineGuidelines: sortDisciplineGuidelinesByThreshold(
      structuredClone(disciplineGuidelines),
    ),
  };
}

export const EMPTY_DISCIPLINARY_SETTINGS_SNAPSHOT: DisciplinarySettingsSnapshot =
  buildDisciplinarySettingsSnapshot(
    DEFAULT_DISCIPLINARY_ROLLING_PERIOD_DAYS,
    DEFAULT_DISCIPLINARY_POINTS_TO_TERMINATION,
    [],
    [],
    [],
  );
