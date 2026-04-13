import type { GoalSource } from '../types';
import { formatDateMmDdYyyy } from './goalSettingHelpers';

const BASELINE_SENTINEL = '1970-01-01';

/**
 * Short label for how goals were resolved for a past day (Previous goals tab).
 */
export function formatResolvedGoalSourceCaption(
  source: GoalSource,
  defaultSnapshotEffectiveFrom?: string
): string {
  if (source === 'weekly') return 'Weekly override';
  if (source === 'futureWeek') return 'Future week override';
  if (
    defaultSnapshotEffectiveFrom != null &&
    defaultSnapshotEffectiveFrom !== BASELINE_SENTINEL
  ) {
    return `Default goals (effective ${formatDateMmDdYyyy(defaultSnapshotEffectiveFrom)})`;
  }
  return 'Default goals';
}
