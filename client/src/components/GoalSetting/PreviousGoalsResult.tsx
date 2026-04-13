import React from 'react';
import { DAY_ORDER, DAY_NAMES, formatDateMmDdYyyy, addDaysToDate } from '../../utils/goalSettingHelpers';
import type { Goal, GoalDailyActuals, ResolvedGoalWithSource } from '../../types';
import { formatResolvedGoalSourceCaption } from '../../utils/goalPreviousGoalsHelpers';

export interface PreviousGoalsResultProps {
  goalsByDay: Array<ResolvedGoalWithSource | null>;
  weekStart: string;
  renderGoalReadOnly: (goal: Goal | null, actuals?: GoalDailyActuals | null) => React.ReactNode;
  actualsByDate: Record<string, GoalDailyActuals> | null;
}

export function PreviousGoalsResult({
  goalsByDay,
  weekStart,
  renderGoalReadOnly,
  actualsByDate,
}: Readonly<PreviousGoalsResultProps>) {
  return (
    <div className="space-y-4">
      {DAY_ORDER.map((day) => {
        const item = goalsByDay[day];
        if (item?.goal == null) return null;
        const iso = addDaysToDate(weekStart, day);
        const dayDate = formatDateMmDdYyyy(iso);
        const dayActuals = actualsByDate?.[iso] ?? null;
        const sourceCaption = formatResolvedGoalSourceCaption(
          item.source,
          item.defaultSnapshotEffectiveFrom,
        );
        return (
          <div
            key={day}
            className="p-4 bg-gray-50 rounded-xl border border-gray-200"
          >
            <h4 className="text-sm font-bold text-primary mb-1">
              {DAY_NAMES[day]} ({dayDate})
            </h4>
            <p className="text-xs text-primary/75 mb-3">{sourceCaption}</p>
            {renderGoalReadOnly(item.goal, dayActuals)}
          </div>
        );
      })}
    </div>
  );
}
