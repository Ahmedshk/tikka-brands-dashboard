import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useBlocker } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import { Dropdown } from '../../components/common/Dropdown';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import { goalService, getTodayInTimezone } from '../../services/goal.service';
import { locationService } from '../../services/location.service';
import type { GoalSetting as GoalSettingType, GoalValues, GoalDayOfWeek, FutureWeekGoals, Goal, GoalSource, Location } from '../../types';
import { RootState } from '../../store/store';
import AdminAndSettingsIcon from '@assets/icons/admin_and_settings.svg?react';
import Popover from '@mui/material/Popover';
import { WeekPickerCalendar, WeekPickerPopover } from '../../components/GoalSetting/WeekPickerCalendar';
import LocationIcon from '@assets/icons/location.svg?react';

const DEFAULT_GOAL_VALUES: GoalValues = {
  salesGoal: 0,
  laborCostGoal: 0,
  hoursGoal: 0,
  spmhGoal: 0,
  foodCostGoal: 0,
  salesGoalTolerance: 0,
  laborCostGoalTolerance: 0,
  hoursGoalTolerance: 0,
  spmhGoalTolerance: 0,
  foodCostGoalTolerance: 0,
};

const GOAL_FIELD_KEYS = [
  'salesGoal',
  'laborCostGoal',
  'hoursGoal',
  'spmhGoal',
  'foodCostGoal',
] as const;

type GoalValueKey = (typeof GOAL_FIELD_KEYS)[number];

const FIELDS: {
  key: GoalValueKey;
  toleranceKey: keyof GoalValues;
  label: string;
  unit?: 'prefix' | 'suffix';
  unitChar?: string;
}[] = [
    { key: 'salesGoal', toleranceKey: 'salesGoalTolerance', label: 'Sales Goal', unit: 'prefix', unitChar: '$' },
    { key: 'laborCostGoal', toleranceKey: 'laborCostGoalTolerance', label: 'Labor cost % Goal', unit: 'suffix', unitChar: '%' },
    { key: 'hoursGoal', toleranceKey: 'hoursGoalTolerance', label: 'Hours Goal', unit: 'suffix', unitChar: ' hrs' },
    { key: 'spmhGoal', toleranceKey: 'spmhGoalTolerance', label: 'SPMH Goal', unit: 'prefix', unitChar: '$' },
    { key: 'foodCostGoal', toleranceKey: 'foodCostGoalTolerance', label: 'Food cost % Goal', unit: 'suffix', unitChar: '%' },
  ];

const DAY_NAMES: Record<GoalDayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

const DAY_ORDER: GoalDayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

type TabId = 'default' | 'weekly' | 'future' | 'previous';

function goalValuesEqual(a: GoalValues, b: GoalValues): boolean {
  return (
    Number(a.salesGoal) === Number(b.salesGoal) &&
    Number(a.laborCostGoal) === Number(b.laborCostGoal) &&
    Number(a.hoursGoal) === Number(b.hoursGoal) &&
    Number(a.spmhGoal) === Number(b.spmhGoal) &&
    Number(a.foodCostGoal) === Number(b.foodCostGoal) &&
    Number(a.salesGoalTolerance ?? 0) === Number(b.salesGoalTolerance ?? 0) &&
    Number(a.laborCostGoalTolerance ?? 0) === Number(b.laborCostGoalTolerance ?? 0) &&
    Number(a.hoursGoalTolerance ?? 0) === Number(b.hoursGoalTolerance ?? 0) &&
    Number(a.spmhGoalTolerance ?? 0) === Number(b.spmhGoalTolerance ?? 0) &&
    Number(a.foodCostGoalTolerance ?? 0) === Number(b.foodCostGoalTolerance ?? 0)
  );
}

function weeklyEqual(
  a: Partial<Record<GoalDayOfWeek, GoalValues>>,
  b: Partial<Record<GoalDayOfWeek, GoalValues>>
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].map(Number));
  for (const k of keys) {
    const ak = a[k as GoalDayOfWeek];
    const bk = b[k as GoalDayOfWeek];
    if ((ak == null) !== (bk == null)) return false;
    if (ak && bk && !goalValuesEqual(ak, bk)) return false;
  }
  return true;
}

function futureWeeksEqual(a: FutureWeekGoals[], b: FutureWeekGoals[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (ai === undefined || bi === undefined) return false;
    if (ai.weekStartDate !== bi.weekStartDate) return false;
    if (!weeklyEqual(ai.days ?? {}, bi.days ?? {})) return false;
  }
  return true;
}

function getSundayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

/** Format YYYY-MM-DD as mm/dd/yyyy */
function formatDateMmDdYyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m ?? ''}/${d ?? ''}/${y ?? ''}`;
}

/** Add days to YYYY-MM-DD, return YYYY-MM-DD */
function addDaysToDate(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = (parts[1] ?? 1) - 1;
  const d = (parts[2] ?? 1) + days;
  const date = new Date(y, m, d);
  const oy = date.getFullYear();
  const om = String(date.getMonth() + 1).padStart(2, '0');
  const od = String(date.getDate()).padStart(2, '0');
  return `${oy}-${om}-${od}`;
}

/** Get Sunday (week start) of current week in timezone as YYYY-MM-DD */
function getCurrentWeekStartInTimezone(timezone: string): string {
  const todayStr = getTodayInTimezone(timezone);
  const parts = todayStr.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = (parts[1] ?? 1) - 1;
  const d = parts[2] ?? 1;
  const date = new Date(Date.UTC(y, m, d));
  const dayOfWeek = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - dayOfWeek);
  const sy = date.getUTCFullYear();
  const sm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const sd = String(date.getUTCDate()).padStart(2, '0');
  return `${sy}-${sm}-${sd}`;
}

function PreviousGoalsResult({
  goalsByDay,
  weekStart,
  renderGoalReadOnly,
}: Readonly<{
  goalsByDay: Array<{ goal: Goal; source: GoalSource } | null>;
  weekStart: string;
  renderGoalReadOnly: (goal: Goal | null) => React.ReactNode;
}>) {
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

export const GoalSetting = () => {
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  /** Location selected on this page for viewing/editing goals; independent of navbar location. */
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('default');
  const [defaultGoals, setDefaultGoals] = useState<GoalValues>({ ...DEFAULT_GOAL_VALUES });
  const [weekly, setWeekly] = useState<Partial<Record<GoalDayOfWeek, GoalValues>>>({});
  const [futureWeeks, setFutureWeeks] = useState<FutureWeekGoals[]>([]);
  const [saved, setSaved] = useState<GoalSettingType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedPreviousWeek, setSelectedPreviousWeek] = useState<string | null>(null);
  const [previousGoalsByDay, setPreviousGoalsByDay] = useState<Array<{ goal: Goal; source: GoalSource } | null> | null>(null);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [futureWeeksExpanded, setFutureWeeksExpanded] = useState<Record<number, boolean>>({});
  const [addWeekAnchorEl, setAddWeekAnchorEl] = useState<HTMLElement | null>(null);
  /** When user tries to switch tab or location with unsaved changes, store the pending action here. */
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [pendingLocation, setPendingLocation] = useState<Location | null>(null);

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedLocation?._id || loading) return false;
    if (!saved) {
      return (
        !goalValuesEqual(defaultGoals, DEFAULT_GOAL_VALUES) ||
        Object.keys(weekly).length > 0 ||
        futureWeeks.length > 0
      );
    }
    const savedDefault = { ...DEFAULT_GOAL_VALUES, ...saved.default };
    return (
      !goalValuesEqual(defaultGoals, savedDefault) ||
      !weeklyEqual(weekly, saved.weekly ?? {}) ||
      !futureWeeksEqual(futureWeeks, saved.futureWeeks ?? [])
    );
  }, [selectedLocation?._id, loading, saved, defaultGoals, weekly, futureWeeks]);

  const blocker = useBlocker(hasUnsavedChanges);

  const timezone = selectedLocation?.timezone ?? 'UTC';
  const currentWeekStart = useMemo(
    () => (selectedLocation?._id ? getCurrentWeekStartInTimezone(timezone) : null),
    [selectedLocation?._id, timezone]
  );
  const nextWeekStart = useMemo(
    () => (currentWeekStart ? addDaysToDate(currentWeekStart, 7) : null),
    [currentWeekStart]
  );
  const lastWeekStart = useMemo(
    () => (currentWeekStart ? addDaysToDate(currentWeekStart, -7) : null),
    [currentWeekStart]
  );
  const futureWeeksFiltered = useMemo(() => {
    if (!currentWeekStart || !futureWeeks.length) return futureWeeks;
    return futureWeeks.filter((w) => w.weekStartDate > currentWeekStart);
  }, [currentWeekStart, futureWeeks]);

  const loadGoals = useCallback((signal?: AbortSignal) => {
    if (!selectedLocation?._id) {
      setLoading(false);
      setDefaultGoals({ ...DEFAULT_GOAL_VALUES });
      setWeekly({});
      setFutureWeeks([]);
      setFutureWeeksExpanded({});
      setSaved(null);
      return;
    }
    setLoading(true);
    setError('');
    goalService
      .getByLocationId(selectedLocation._id, { signal })
      .then((setting) => {
        setDefaultGoals({ ...DEFAULT_GOAL_VALUES, ...setting.default });
        setWeekly(setting.weekly ?? {});
        setFutureWeeks(setting.futureWeeks ?? []);
        setFutureWeeksExpanded({});
        setSaved(setting);
      })
      .catch((err) => {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load goals');
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, [selectedLocation?._id]);

  useEffect(() => {
    const controller = new AbortController();
    loadGoals(controller.signal);
    return () => controller.abort();
  }, [loadGoals]);

  useEffect(() => {
    locationService
      .getAll()
      .then(setLocations)
      .catch(() => setLocations([]))
      .finally(() => setLocationsLoading(false));
  }, []);

  /** Initialize page selection from navbar location when user hasn't selected one yet. */
  useEffect(() => {
    if (currentLocation != null) {
      setSelectedLocation((prev) => prev ?? currentLocation);
    }
  }, [currentLocation]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!selectedLocation?._id || !selectedPreviousWeek) {
      setPreviousGoalsByDay(null);
      return;
    }
    const controller = new AbortController();
    setLoadingPrevious(true);
    setPreviousGoalsByDay(null);
    const promises = DAY_ORDER.map((day) => {
      const date = addDaysToDate(selectedPreviousWeek, day);
      return goalService.getResolvedWithSource(selectedLocation._id, date, { signal: controller.signal });
    });
    Promise.all(promises)
      .then((results) => setPreviousGoalsByDay(results))
      .catch(() => {
        if (!controller.signal.aborted) setPreviousGoalsByDay(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPrevious(false);
      });
    return () => controller.abort();
  }, [selectedLocation?._id, selectedPreviousWeek]);

  const updateDefault = (key: keyof GoalValues, value: string) => {
    const num = value === '' ? 0 : Number(value);
    setDefaultGoals((prev) => ({
      ...prev,
      [key]: Number.isNaN(num) ? prev[key] : num,
    }));
  };

  /** For days with no weekly override, show empty (zeros); otherwise show set values. */
  const getWeeklyDay = (day: GoalDayOfWeek): GoalValues => {
    const dayValues = weekly[day];
    return dayValues ? { ...DEFAULT_GOAL_VALUES, ...dayValues } : { ...DEFAULT_GOAL_VALUES };
  };

  const updateWeeklyDay = (day: GoalDayOfWeek, key: keyof GoalValues, value: string) => {
    const num = value === '' ? 0 : Number(value);
    setWeekly((prev) => {
      const current = prev[day] ?? { ...DEFAULT_GOAL_VALUES };
      const next = { ...current, [key]: Number.isNaN(num) ? current[key] : num };
      return { ...prev, [day]: next };
    });
  };

  const addFutureWeekWithDate = (weekStartSunday: string) => {
    const newIndex = futureWeeks.length;
    setFutureWeeks((prev) => [...prev, { weekStartDate: weekStartSunday, days: {} }]);
    setFutureWeeksExpanded((prev) => {
      const next: Record<number, boolean> = {};
      Object.keys(prev).forEach((k) => {
        next[Number(k)] = false;
      });
      next[newIndex] = true;
      return next;
    });
    setAddWeekAnchorEl(null);
  };

  const handleAddWeekClick = (e: React.MouseEvent<HTMLElement>) => {
    setAddWeekAnchorEl(e.currentTarget);
  };

  const handleAddWeekCalendarChange = (sunday: string) => {
    if (futureWeeks.some((w) => w.weekStartDate === sunday)) {
      toast.error('This week is already added.');
      return;
    }
    addFutureWeekWithDate(sunday);
  };

  const setFutureWeekExpanded = (index: number, expanded: boolean) => {
    setFutureWeeksExpanded((prev) => {
      if (expanded) {
        return { [index]: true };
      }
      const next = { ...prev };
      next[index] = false;
      return next;
    });
  };

  const removeFutureWeek = (index: number) => {
    setFutureWeeks((prev) => prev.filter((_, i) => i !== index));
  };

  const getFutureWeekDay = (weekIndex: number, day: GoalDayOfWeek): GoalValues => {
    const week = futureWeeks[weekIndex];
    if (!week) return { ...DEFAULT_GOAL_VALUES };
    const dayValues = week.days[day];
    return dayValues ? { ...DEFAULT_GOAL_VALUES, ...dayValues } : { ...DEFAULT_GOAL_VALUES };
  };

  const updateFutureWeekDay = (
    weekIndex: number,
    day: GoalDayOfWeek,
    key: keyof GoalValues,
    value: string
  ) => {
    const num = value === '' ? 0 : Number(value);
    setFutureWeeks((prev) => {
      const next = [...prev];
      const existing = next[weekIndex];
      if (!existing) return prev;
      const week = { ...existing, days: { ...existing.days } };
      const current = week.days[day] ?? { ...DEFAULT_GOAL_VALUES };
      week.days[day] = { ...current, [key]: Number.isNaN(num) ? current[key] : num };
      next[weekIndex] = week;
      return next;
    });
  };

  const updateFutureWeekStartDate = (weekIndex: number, dateStr: string) => {
    const normalized = getSundayOfWeek(new Date(dateStr + 'T12:00:00'));
    setFutureWeeks((prev) => {
      const next = [...prev];
      const existing = next[weekIndex];
      if (!existing) return prev;
      next[weekIndex] = { ...existing, weekStartDate: normalized };
      return next;
    });
  };

  const handleReset = () => {
    if (saved) {
      setDefaultGoals({ ...DEFAULT_GOAL_VALUES, ...saved.default });
      setWeekly(saved.weekly ?? {});
      setFutureWeeks(saved.futureWeeks ?? []);
    }
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocation?._id) {
      setError('Please select a location first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await goalService.upsert({
        locationId: selectedLocation._id,
        default: defaultGoals,
        weekly: Object.keys(weekly).length > 0 ? weekly : undefined,
        futureWeeks,
      });
      setSaved(updated);
      setDefaultGoals({ ...DEFAULT_GOAL_VALUES, ...updated.default });
      setWeekly(updated.weekly ?? {});
      setFutureWeeks(updated.futureWeeks ?? []);
      toast.success('Goals saved successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save goals';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const renderGoalInputs = (
    values: GoalValues,
    onChange: (key: keyof GoalValues, value: string) => void,
    idPrefix: string
  ) => (
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

  const formatGoalValue = (key: GoalValueKey, value: number): string => {
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
  };

  const formatToleranceValue = (goal: Goal | null, toleranceKey: keyof GoalValues): string => {
    if (goal == null) return '—';
    const val = goal[toleranceKey];
    if (typeof val !== 'number') return '—';
    return `${Number(val).toFixed(2)}%`;
  };

  const renderGoalReadOnly = (goal: Goal | null) => (
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

  return (
    <Layout>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminAndSettingsIcon
              className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary"
              aria-hidden
            />
            Goal Setting
          </h2>
        </div>

        <div className="bg-card-background rounded-xl overflow-hidden">
          <div className="h-4 rounded-t-xl bg-primary" aria-hidden />
          <div className="p-6">
            <div className="mb-6 max-w-md">
              <Dropdown
                options={locations.map((loc) => ({
                  value: loc._id,
                  label: loc.storeName,
                  secondaryLabel: loc.address,
                }))}
                value={selectedLocation?._id ?? ''}
                onChange={(id) => {
                  const loc = locations.find((l) => l._id === id);
                  if (!loc) return;
                  if (hasUnsavedChanges) {
                    setPendingLocation(loc);
                  } else {
                    setSelectedLocation(loc);
                  }
                }}
                placeholder={locationsLoading ? 'Loading...' : locations.length === 0 ? 'No locations' : 'Select location'}
                aria-label="Select location"
                className="w-full"
                allowEmpty={false}
                disabled={locationsLoading}
                triggerLabel={
                  <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    <LocationIcon className="w-4 h-4 md:w-4.5 md:h-4.5 2xl:w-5 2xl:h-5 flex-shrink-0 text-primary" />
                    {locationsLoading ? (
                      <>
                        <Spinner size="sm" className="flex-shrink-0 text-button-primary" />
                        <span className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">Loading...</span>
                      </>
                    ) : selectedLocation ? (
                      <span
                        className="font-semibold text-secondary text-sm md:text-base 2xl:text-lg truncate"
                        title={selectedLocation.address ? `${selectedLocation.storeName} – ${selectedLocation.address}` : selectedLocation.storeName}
                      >
                        {selectedLocation.storeName}
                      </span>
                    ) : locations.length === 0 ? (
                      <span className="text-sm text-primary">No locations</span>
                    ) : (
                      <span className="text-sm text-secondary">Select location</span>
                    )}
                  </span>
                }
              />
            </div>

            {!selectedLocation?._id ? (
              <p className="text-primary">
                Select a location above to view and edit goals. Each location has its own goals.
              </p>
            ) : loading ? (
              <p className="text-primary">Loading goals...</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2 sm:border-b sm:border-gray-200 mb-6">
                  {(
                    [
                      { id: 'default' as TabId, label: 'Default' },
                      { id: 'weekly' as TabId, label: 'By day of week' },
                      { id: 'future' as TabId, label: 'Future weeks' },
                      { id: 'previous' as TabId, label: 'Previous goals' },
                    ] as const
                  ).map(({ id, label }) => {
                    const isActive = activeTab === id;
                    const tabClass = isActive
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-primary hover:bg-gray-200';
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (hasUnsavedChanges) {
                            setPendingTab(id);
                          } else {
                            if (id === 'future') setFutureWeeksExpanded({});
                            setActiveTab(id);
                          }
                        }}
                        className={`px-3 py-2.5 sm:py-2 text-sm font-medium rounded-lg sm:rounded-b-none sm:rounded-t-lg transition-colors ${tabClass}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {error && (
                  <p
                    className="mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                <form onSubmit={handleSubmit}>
                  {activeTab === 'default' && (
                    <div className="space-y-4">
                      <p className="text-sm text-primary">
                        Default goals are used when no day or week override is
                        set.
                      </p>
                      <div className="max-w-full">
                        {renderGoalInputs(defaultGoals, updateDefault, 'default')}
                      </div>
                    </div>
                  )}

                  {activeTab === 'weekly' && (
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
                              {renderGoalInputs(
                                getWeeklyDay(day),
                                (key, value) => updateWeeklyDay(day, key, value),
                                `weekly-${day}`
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {activeTab === 'future' && (
                    <div className="space-y-6">
                      <p className="text-sm text-primary">
                        Set goals for specific weeks. Pick any day in the
                        calendar to select that week (Sunday–Saturday); goals
                        will apply to that week only.
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
                              onClick={() =>
                                setFutureWeekExpanded(index, !isExpanded)
                              }
                              className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-primary hover:bg-gray-100/80 transition-colors"
                            >
                              <span>{headerLabel}</span>
                              <span
                                className="text-gray-500 shrink-0"
                                aria-hidden
                              >
                                {isExpanded ? '▼' : '▶'}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="border-t border-gray-200 p-4 space-y-4">
                                <div className="flex flex-wrap items-center gap-4">
                                  <WeekPickerPopover
                                    id={`future-week-calendar-${index}`}
                                    value={week.weekStartDate}
                                    onChange={(sunday) =>
                                      updateFutureWeekStartDate(index, sunday)
                                    }
                                    minDate={
                                      nextWeekStart
                                        ? new Date(
                                          nextWeekStart + 'T12:00:00'
                                        )
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
                                        {renderGoalInputs(
                                          getFutureWeekDay(index, day),
                                          (key, value) =>
                                            updateFutureWeekDay(
                                              index,
                                              day,
                                              key,
                                              value
                                            ),
                                          `future-${index}-${day}`
                                        )}
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
                  )}

                  {activeTab === 'previous' && (
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
                  )}

                  {activeTab !== 'previous' && (
                    <div className="mt-8 flex gap-3 max-w-xs">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="flex-1 min-w-0 flex items-center justify-center px-4 py-3 border border-gray-200 rounded-xl text-sm md:text-base 2xl:text-lg font-medium text-primary hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 min-w-0 flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-sm md:text-base 2xl:text-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
                      >
                        {saving ? (
                          <>
                            <Spinner size="sm" className="h-4 w-4 text-white" />
                            Saving...
                          </>
                        ) : (
                          'Save Goals'
                        )}
                      </button>
                    </div>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={pendingTab !== null || pendingLocation !== null || blocker.state === 'blocked'}
        onClose={() => {
          setPendingTab(null);
          setPendingLocation(null);
          if (blocker.state === 'blocked') blocker.reset();
        }}
        title="Unsaved changes"
        message="Any unsaved changes will be lost. Are you sure you want to leave?"
        confirmLabel="Leave"
        cancelLabel="Stay"
        onConfirm={() => {
          if (pendingTab !== null) {
            handleReset();
            if (pendingTab === 'future') setFutureWeeksExpanded({});
            setActiveTab(pendingTab);
            setPendingTab(null);
          } else if (pendingLocation !== null) {
            setSelectedLocation(pendingLocation);
            setPendingLocation(null);
          } else if (blocker.state === 'blocked') {
            blocker.proceed();
          }
        }}
        variant="danger"
      />
    </Layout>
  );
};
