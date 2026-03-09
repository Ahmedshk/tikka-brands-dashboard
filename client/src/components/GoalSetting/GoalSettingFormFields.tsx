import React from 'react';
import { FIELDS, type GoalValueKey } from '../../utils/goalSettingHelpers';
import type { GoalValues, Goal } from '../../types';

function formatGoalValue(key: GoalValueKey, value: number): string {
  if (key === 'laborCostGoal' || key === 'foodCostGoal') {
    return `${Number(value).toFixed(2)}%`;
  }
  if (key === 'salesGoal' || key === 'spmhGoal') {
    return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (key === 'hoursGoal') {
    return `${Number(value).toFixed(2)} hrs`;
  }
  return String(value);
}

function formatToleranceValue(goal: Goal | null, toleranceKey: keyof GoalValues): string {
  if (goal == null) return '—';
  const val = goal[toleranceKey];
  if (typeof val !== 'number') return '—';
  return `${Number(val).toFixed(2)}%`;
}

export interface GoalSettingFormFieldsEditProps {
  mode: 'edit';
  values: GoalValues;
  onChange: (key: keyof GoalValues, value: string) => void;
  idPrefix: string;
}

export interface GoalSettingFormFieldsReadOnlyProps {
  mode: 'readonly';
  goal: Goal | null;
}

export type GoalSettingFormFieldsProps =
  | GoalSettingFormFieldsEditProps
  | GoalSettingFormFieldsReadOnlyProps;

export function GoalSettingFormFields(props: GoalSettingFormFieldsProps) {
  if (props.mode === 'readonly') {
    const goal = props.goal;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-8">
        {FIELDS.map(({ key, toleranceKey, label }) => {
          const numVal = goal != null && typeof goal[key] === 'number' ? goal[key] : null;
          const display = numVal === null ? '—' : formatGoalValue(key, numVal);
          const toleranceDisplay = formatToleranceValue(goal, toleranceKey);
          return (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-xs md:text-sm font-medium text-primary">{label}</span>
              <div className="flex flex-row gap-x-2 items-baseline">
                <span className="text-sm text-primary py-2">{display}</span>
                <span className="text-xs text-primary/80">
                  Tolerance: {toleranceDisplay}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const { values, onChange, idPrefix } = props;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-8">
      {FIELDS.map(({ key, toleranceKey, label, unit, unitChar }) => {
        const toleranceVal = values[toleranceKey] ?? 0;
        return (
          <div key={key} className="flex flex-col gap-2">
            <div className="flex flex-row gap-2 items-center">
              <label
                htmlFor={`${idPrefix}-${key}`}
                className="flex-1 min-w-0 text-xs md:text-sm font-medium text-primary"
              >
                {label}
              </label>
              <label
                htmlFor={`${idPrefix}-${toleranceKey}`}
                className="shrink-0 w-26 text-xs font-medium text-primary text-left"
              >
                Tolerance %
              </label>
            </div>
            <div className="flex flex-row gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center rounded-xl border border-[#DBDBDB] bg-[#F9F9F9] overflow-hidden">
                  {unit === 'prefix' && unitChar != null && (
                    <span className="pl-3 text-sm text-primary shrink-0">{unitChar}</span>
                  )}
                  <input
                    id={`${idPrefix}-${key}`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={values[key] === 0 ? '' : values[key]}
                    onChange={(e) => onChange(key, e.target.value)}
                    onKeyDown={(e) => {
                      if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    }}
                    className="w-full min-w-0 px-3 py-2 bg-transparent border-0 text-sm text-primary focus:ring-0 focus:outline-none"
                  />
                  {unit === 'suffix' && unitChar != null && (
                    <span className="pr-3 text-sm text-primary shrink-0">{unitChar}</span>
                  )}
                </div>
              </div>
              <div className="shrink-0 w-26">
                <div className="flex items-center rounded-xl border border-[#DBDBDB] bg-[#F9F9F9] overflow-hidden">
                  <input
                    id={`${idPrefix}-${toleranceKey}`}
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={toleranceVal === 0 ? '' : toleranceVal}
                    onChange={(e) => onChange(toleranceKey, e.target.value)}
                    onKeyDown={(e) => {
                      if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                    }}
                    className="w-full min-w-0 px-3 py-2 bg-transparent border-0 text-sm text-primary focus:ring-0 focus:outline-none"
                  />
                  <span className="pr-3 text-sm text-primary shrink-0">%</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
