import React from 'react';
import Popover from '@mui/material/Popover';
import { WeekPickerCalendar, WeekPickerPopover } from './WeekPickerCalendar';
import { GoalSettingFormFields } from './GoalSettingFormFields';
import { PreviousGoalsResult } from './PreviousGoalsResult';
import {
  DAY_ORDER,
  DAY_NAMES,
  formatDateMmDdYyyy,
  addDaysToDate,
  type GoalDayOfWeek,
  type GoalValues,
  type FutureWeekGoals,
} from '../../utils/goalSettingHelpers';
import type { Goal, GoalSource } from '../../types';

export interface DefaultGoalsTabProps {
  defaultGoals: GoalValues;
  updateDefault: (key: keyof GoalValues, value: string) => void;
}

export function DefaultGoalsTab({ defaultGoals, updateDefault }: Readonly<DefaultGoalsTabProps>) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-primary">
        Default goals are used when no day or week override is set.
      </p>
      <div className="max-w-full">
        <GoalSettingFormFields
          mode="edit"
          values={defaultGoals}
          onChange={updateDefault}
          idPrefix="default"
        />
      </div>
    </div>
  );
}

export interface WeeklyGoalsTabProps {
  currentWeekStart: string | null;
  getWeeklyDay: (day: GoalDayOfWeek) => GoalValues;
  updateWeeklyDay: (day: GoalDayOfWeek, key: keyof GoalValues, value: string) => void;
}

export function WeeklyGoalsTab({
  currentWeekStart,
  getWeeklyDay,
  updateWeeklyDay,
}: Readonly<WeeklyGoalsTabProps>) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-primary font-medium">
        Default goals will be used for any day that does not have a weekly goal set.
      </p>
      <p className="text-sm text-primary">
        Set goals for each day of the week (Sunday–Saturday). Leave a day empty to use default goals.
      </p>
      <div className="space-y-4 overflow-x-auto">
        {DAY_ORDER.map((day) => {
          const dayDate = currentWeekStart
            ? formatDateMmDdYyyy(addDaysToDate(currentWeekStart, day))
            : null;
          return (
            <div
              key={day}
              className="p-4 bg-gray-50 rounded-xl border border-gray-200"
            >
              <h4 className="text-sm font-bold text-primary mb-3">
                {DAY_NAMES[day]}
                {dayDate != null && (
                  <span className="font-bold text-primary/80 ml-2">
                    ({dayDate})
                  </span>
                )}
              </h4>
              <GoalSettingFormFields
                mode="edit"
                values={getWeeklyDay(day)}
                onChange={(key, value) => updateWeeklyDay(day, key, value)}
                idPrefix={`weekly-${day}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface FutureWeeksTabProps {
  futureWeeks: FutureWeekGoals[];
  futureWeeksFiltered: FutureWeekGoals[];
  futureWeeksExpanded: Record<number, boolean>;
  nextWeekStart: string | null;
  addWeekAnchorEl: HTMLElement | null;
  setAddWeekAnchorEl: (el: HTMLElement | null) => void;
  setFutureWeekExpanded: (index: number, expanded: boolean) => void;
  removeFutureWeek: (index: number) => void;
  getFutureWeekDay: (weekIndex: number, day: GoalDayOfWeek) => GoalValues;
  updateFutureWeekDay: (
    weekIndex: number,
    day: GoalDayOfWeek,
    key: keyof GoalValues,
    value: string
  ) => void;
  updateFutureWeekStartDate: (weekIndex: number, dateStr: string) => void;
  handleAddWeekClick: (e: React.MouseEvent<HTMLElement>) => void;
  handleAddWeekCalendarChange: (sunday: string) => void;
}

export function FutureWeeksTab({
  futureWeeks,
  futureWeeksFiltered,
  futureWeeksExpanded,
  nextWeekStart,
  addWeekAnchorEl,
  setAddWeekAnchorEl,
  setFutureWeekExpanded,
  removeFutureWeek,
  getFutureWeekDay,
  updateFutureWeekDay,
  updateFutureWeekStartDate,
  handleAddWeekClick,
  handleAddWeekCalendarChange,
}: Readonly<FutureWeeksTabProps>) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-primary">
        Set goals for specific weeks. Pick any day in the calendar to select that week (Sunday–Saturday); goals will apply to that week only.
      </p>
      {futureWeeksFiltered.map((week) => {
        const index = futureWeeks.findIndex(
          (w) => w.weekStartDate === week.weekStartDate
        );
        if (index < 0) return null;
        const weekEndDate = addDaysToDate(week.weekStartDate, 6);
        const headerLabel = `Week of ${formatDateMmDdYyyy(week.weekStartDate)} – ${formatDateMmDdYyyy(weekEndDate)}`;
        const isExpanded = futureWeeksExpanded[index] ?? false;
        return (
          <div
            key={`future-week-${index}`}
            className="rounded-xl border border-gray-200 bg-white overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setFutureWeekExpanded(index, !isExpanded)}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-primary hover:bg-gray-100/80 transition-colors"
            >
              <span>{headerLabel}</span>
              <span className="text-gray-500 shrink-0" aria-hidden>
                {isExpanded ? '▼' : '▶'}
              </span>
            </button>
            {isExpanded && (
              <div className="border-t border-gray-200 p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <WeekPickerPopover
                    id={`future-week-calendar-${index}`}
                    value={week.weekStartDate}
                    onChange={(sunday) => updateFutureWeekStartDate(index, sunday)}
                    minDate={
                      nextWeekStart
                        ? new Date(nextWeekStart + 'T12:00:00')
                        : undefined
                    }
                    placeholder="Select week"
                  />
                  <button
                    type="button"
                    onClick={() => removeFutureWeek(index)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Remove week
                  </button>
                </div>
                <div className="space-y-3">
                  {DAY_ORDER.map((day) => {
                    const dayDate = formatDateMmDdYyyy(
                      addDaysToDate(week.weekStartDate, day)
                    );
                    return (
                      <div
                        key={day}
                        className="rounded-xl p-4 border border-gray-200 bg-gray-50"
                      >
                        <span className="text-xs font-bold text-primary block mb-1">
                          {DAY_NAMES[day]} ({dayDate})
                        </span>
                        <GoalSettingFormFields
                          mode="edit"
                          values={getFutureWeekDay(index, day)}
                          onChange={(key, value) =>
                            updateFutureWeekDay(index, day, key, value)
                          }
                          idPrefix={`future-${index}-${day}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={handleAddWeekClick}
        className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-primary hover:bg-gray-50"
      >
        Add week
      </button>
      <Popover
        open={Boolean(addWeekAnchorEl)}
        anchorEl={addWeekAnchorEl}
        onClose={() => setAddWeekAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: { mt: 1.5, borderRadius: 2 },
          },
        }}
      >
        <div className="p-2">
          <p className="text-sm font-medium text-primary px-2 py-1 mb-1">
            Pick a week to add (already added weeks are disabled)
          </p>
          <WeekPickerCalendar
            value={null}
            onChange={handleAddWeekCalendarChange}
            minDate={
              nextWeekStart
                ? new Date(nextWeekStart + 'T12:00:00')
                : undefined
            }
            disabledWeekStarts={futureWeeks.map((w) => w.weekStartDate)}
          />
        </div>
      </Popover>
    </div>
  );
}

export interface PreviousGoalsTabProps {
  selectedPreviousWeek: string | null;
  lastWeekStart: string | null;
  loadingPrevious: boolean;
  previousGoalsByDay: Array<{ goal: Goal; source: GoalSource } | null> | null;
  setSelectedPreviousWeek: (sunday: string | null) => void;
  renderGoalReadOnly: (goal: Goal | null) => React.ReactNode;
}

export function PreviousGoalsTab({
  selectedPreviousWeek,
  lastWeekStart,
  loadingPrevious,
  previousGoalsByDay,
  setSelectedPreviousWeek,
  renderGoalReadOnly,
}: Readonly<PreviousGoalsTabProps>) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-primary">
        View resolved goals for a past week (read-only). Select a week to see the goals that were set for each day.
      </p>
      <div>
        <label
          htmlFor="previous-week-picker"
          className="block text-sm font-medium text-primary mb-2"
        >
          Select week
        </label>
        <WeekPickerPopover
          id="previous-week-picker"
          value={selectedPreviousWeek}
          onChange={(sunday) => setSelectedPreviousWeek(sunday)}
          maxDate={
            lastWeekStart
              ? new Date(lastWeekStart + 'T12:00:00')
              : undefined
          }
          placeholder="Select week"
        />
      </div>
      {loadingPrevious && (
        <p className="text-sm text-primary">Loading goals...</p>
      )}
      {!loadingPrevious &&
        selectedPreviousWeek != null &&
        previousGoalsByDay != null && (
          <div className="space-y-4">
            <PreviousGoalsResult
              goalsByDay={previousGoalsByDay}
              weekStart={selectedPreviousWeek}
              renderGoalReadOnly={renderGoalReadOnly}
            />
          </div>
        )}
    </div>
  );
}
