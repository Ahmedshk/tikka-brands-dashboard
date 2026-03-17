import { getModuleSegmentStatuses } from './trainingProgressUtils';
import type { EmployeeTrainingRow } from '../types/trainingReviews.types';

export interface TrainingKpiValues {
  staffInTraining: number;
  trainingsOverdue: number;
  trainingCompletionPct: string;
}

export function computeTrainingKpis(rows: EmployeeTrainingRow[]): TrainingKpiValues {
  if (rows.length === 0) {
    return { staffInTraining: 0, trainingsOverdue: 0, trainingCompletionPct: '0%' };
  }

  const uniqueUsers = new Set(rows.map((r) => r.userId));
  const staffInTraining = uniqueUsers.size;

  let overdueCount = 0;
  let completedCount = 0;

  for (const row of rows) {
    if (row.status === 'Complete') {
      completedCount++;
      continue;
    }
    const segments = getModuleSegmentStatuses(row.assignedAt, row.moduleDurations, row.moduleProgress);
    if (segments.includes('red')) {
      overdueCount++;
    }
  }

  const pct = Math.round((completedCount / rows.length) * 100);
  const trainingCompletionPct = `${pct}%`;

  return { staffInTraining, trainingsOverdue: overdueCount, trainingCompletionPct };
}
