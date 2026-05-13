import { FIELDS, type GoalValueKey } from '../../utils/goalSettingHelpers';
import type { GoalValues, Goal, GoalDailyActuals } from '../../types';
import {
  formatGoalMetricValue,
  formatTolerancePercent,
  formatActualForGoalField,
} from '../../utils/goalSettingDisplayFormatters';
import {
  classifyGoalVsActualTrend,
  formatSignedPercentDiff,
  percentDiffVsGoalTarget,
  trendToDisplayColor,
} from '../../utils/goalActualVsTarget.util';
import { Spinner } from '../common/Spinner';

export interface GoalSettingFormFieldsEditProps {
  mode: 'edit';
  values: GoalValues;
  onChange: (key: keyof GoalValues, value: string) => void;
  idPrefix: string;
  /** When true, show per-metric actuals (e.g. “By day of week” tab only). */
  showActuals?: boolean;
  /** When set, shows actuals under each goal (e.g. from daily rollups). */
  actuals?: GoalDailyActuals | null;
  /** When true, each actual row shows a spinner until data arrives. */
  loadingActuals?: boolean;
  /** RBAC: only these goal metrics are shown; omit for all (backward compat). */
  allowedGoalKeys?: ReadonlySet<GoalValueKey>;
}

export interface GoalSettingFormFieldsReadOnlyProps {
  mode: 'readonly';
  goal: Goal | null;
  actuals?: GoalDailyActuals | null;
  loadingActuals?: boolean;
  allowedGoalKeys?: ReadonlySet<GoalValueKey>;
}

export type GoalSettingFormFieldsProps =
  | GoalSettingFormFieldsEditProps
  | GoalSettingFormFieldsReadOnlyProps;

function ActualValueLine({
  goalKey,
  toleranceKey,
  goalValues,
  actuals,
  loadingActuals,
}: Readonly<{
  goalKey: (typeof FIELDS)[number]['key'];
  toleranceKey: keyof GoalValues;
  goalValues: Goal | GoalValues | null | undefined;
  actuals: GoalDailyActuals | null | undefined;
  loadingActuals: boolean;
}>) {
  const trend = classifyGoalVsActualTrend(goalKey, toleranceKey, goalValues, actuals);
  const color = trendToDisplayColor(trend);
  const pct = percentDiffVsGoalTarget(goalKey, goalValues, actuals);
  const valueText = formatActualForGoalField(goalKey, actuals);
  const pctText = pct === null || pct === undefined ? null : formatSignedPercentDiff(pct);
  const showPct = pctText !== null && valueText !== '—';
  const hasColor = color !== null;

  return (
    <span className="text-xs inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 min-h-[1.25rem]">
      <span className="shrink-0 text-primary/70">Actual:</span>
      {loadingActuals ? (
        <Spinner size="sm" className="text-primary/60" />
      ) : (
        <span
          className={hasColor ? undefined : 'text-primary/70'}
          style={hasColor ? { color } : undefined}
        >
          <span className="font-medium">{valueText}</span>
          {showPct ? <span className="ml-2 font-medium">({pctText})</span> : null}
        </span>
      )}
    </span>
  );
}

export function GoalSettingFormFields(props: GoalSettingFormFieldsProps) {
  const allowedGoalKeys = props.allowedGoalKeys;
  const visibleFields =
    allowedGoalKeys == null ? FIELDS : FIELDS.filter((f) => allowedGoalKeys.has(f.key));

  if (visibleFields.length === 0) {
    return (
      <p className="text-sm text-primary/80 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
        You do not have permission to view any goal metrics for this page.
      </p>
    );
  }

  if (props.mode === 'readonly') {
    const { goal, actuals, loadingActuals = false } = props;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-8">
        {visibleFields.map(({ key, toleranceKey, label }) => {
          const numVal = goal != null && typeof goal[key] === 'number' ? goal[key] : null;
          const display = numVal === null ? '—' : formatGoalMetricValue(key, numVal);
          const toleranceDisplay = formatTolerancePercent(goal, toleranceKey);
          return (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-xs md:text-sm font-medium text-primary">{label}</span>
              <div className="flex flex-row gap-x-2 items-baseline">
                <span className="text-sm text-primary py-2">{display}</span>
                <span className="text-xs text-primary/80">
                  Tolerance: {toleranceDisplay}
                </span>
              </div>
              <ActualValueLine
                goalKey={key}
                toleranceKey={toleranceKey}
                goalValues={goal}
                actuals={actuals}
                loadingActuals={loadingActuals}
              />
            </div>
          );
        })}
      </div>
    );
  }

  const {
    values,
    onChange,
    idPrefix,
    showActuals = false,
    actuals,
    loadingActuals = false,
  } = props;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-8">
      {visibleFields.map(({ key, toleranceKey, label, unit, unitChar }) => {
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
            {showActuals ? (
              <ActualValueLine
                goalKey={key}
                toleranceKey={toleranceKey}
                goalValues={values}
                actuals={actuals}
                loadingActuals={loadingActuals}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
