import React from 'react';
import { DAY_ORDER, DAY_NAMES, formatDateMmDdYyyy, addDaysToDate } from '../../utils/goalSettingHelpers';
import type { Goal, GoalSource } from '../../types';

export interface PreviousGoalsResultProps {
  goalsByDay: Array<{ goal: Goal; source: GoalSource } | null>;
  weekStart: string;
  renderGoalReadOnly: (goal: Goal | null) => React.ReactNode;
}

export function PreviousGoalsResult({
  goalsByDay,
  weekStart,
  renderGoalReadOnly,
}: Readonly<PreviousGoalsResultProps>) {
  const daysWithGoal = DAY_ORDER.filter(
    (day) =>
      goalsByDay[day]?.source != null && goalsByDay[day]?.source !== 'default'
  );
  const daysWithoutGoal = DAY_ORDER.filter(
    (day) =>
      !goalsByDay[day] || goalsByDay[day]?.source === 'default'
  );
  const allDefault = daysWithGoal.length === 0;

  if (allDefault) {
    return (
      <p className="text-sm text-primary">
        No goal data was set for this week.
      </p>
    );
  }

  return (
    <>
      {daysWithoutGoal.length > 0 && (
        <p className="text-sm text-primary">
          Goals were not set for the following days; default goals would apply:{' '}
          {daysWithoutGoal.map((d) => DAY_NAMES[d]).join(', ')}.
        </p>
      )}
      {daysWithGoal.map((day) => {
        const item = goalsByDay[day];
        if (!item?.goal) return null;
        const dayDate = formatDateMmDdYyyy(addDaysToDate(weekStart, day));
        return (
          <div
            key={day}
            className="p-4 bg-gray-50 rounded-xl border border-gray-200"
          >
            <h4 className="text-sm font-bold text-primary mb-3">
              {DAY_NAMES[day]} ({dayDate})
            </h4>
            {renderGoalReadOnly(item.goal)}
          </div>
        );
      })}
    </>
  );
}
