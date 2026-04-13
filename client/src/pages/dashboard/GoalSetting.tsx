import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useBlocker } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import { goalService } from '../../services/goal.service';
import { locationService } from '../../services/location.service';
import type {
  GoalSetting as GoalSettingType,
  GoalValues,
  GoalDayOfWeek,
  FutureWeekGoals,
  Goal,
  GoalDailyActuals,
  LocationListItem,
  ResolvedGoalWithSource,
} from '../../types';
import { RootState } from '../../store/store';
import { getStoredLocationId } from '../../store/slices/location.slice';
import AdminAndSettingsIcon from '@assets/icons/admin_and_settings.svg?react';
import {
  DEFAULT_GOAL_VALUES,
  DAY_ORDER,
  goalValuesEqual,
  weeklyEqual,
  futureWeeksEqual,
  getCurrentWeekStartInTimezone,
  addDaysToDate,
  getSundayOfWeek,
  type TabId,
} from '../../utils/goalSettingHelpers';
import {
  mergeGoalValuesForSave,
  mergeWeeklyForSave,
  mergeFutureWeeksForSave,
} from '../../utils/goalSettingPermissionHelpers';
import { useGoalSettingAllowedGoalKeys } from '../../hooks/useGoalSettingAllowedGoalKeys';
import { GoalSettingFormFields } from '../../components/GoalSetting/GoalSettingFormFields';
import {
  DefaultGoalsTab,
  WeeklyGoalsTab,
  FutureWeeksTab,
  PreviousGoalsTab,
} from '../../components/GoalSetting/GoalSettingTabPanels';
import { GoalSettingLocationDropdown } from '../../components/GoalSetting/GoalSettingLocationDropdown';
import { GoalSettingMainContent } from '../../components/GoalSetting/GoalSettingMainContent';

export const GoalSetting = () => {
  const allowedGoalKeys = useGoalSettingAllowedGoalKeys();
  const canEditAnyGoalMetric = allowedGoalKeys.size > 0;
  const currentLocation = useSelector((state: RootState) => state.location.currentLocation);
  /** Location selected on this page for viewing/editing goals; independent of navbar location. */
  const [selectedLocation, setSelectedLocation] = useState<LocationListItem | null>(null);
  const [locations, setLocations] = useState<LocationListItem[]>([]);
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
  const [previousGoalsByDay, setPreviousGoalsByDay] = useState<Array<ResolvedGoalWithSource | null> | null>(
    null
  );
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [goalActualsByDate, setGoalActualsByDate] = useState<Record<string, GoalDailyActuals> | null>(
    null
  );
  const [loadingGoalActuals, setLoadingGoalActuals] = useState(false);
  const [futureWeeksExpanded, setFutureWeeksExpanded] = useState<Record<number, boolean>>({});
  const [addWeekAnchorEl, setAddWeekAnchorEl] = useState<HTMLElement | null>(null);
  /** When user tries to switch tab or location with unsaved changes, store the pending action here. */
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [pendingLocation, setPendingLocation] = useState<LocationListItem | null>(null);

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
    let cancelled = false;
    setLocationsLoading(true);
    locationService
      .getAll()
      .then((data) => {
        if (cancelled) return;
        setLocations(data);
        const storedId = getStoredLocationId();
        const match = storedId ? data.find((loc) => loc._id === storedId) : undefined;
        setSelectedLocation((prev) => prev ?? match ?? data[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    if (!selectedLocation?._id || (activeTab !== 'weekly' && activeTab !== 'previous')) {
      setGoalActualsByDate(null);
      setLoadingGoalActuals(false);
      return;
    }
    const weekStart = activeTab === 'weekly' ? currentWeekStart : selectedPreviousWeek;
    if (!weekStart) {
      setGoalActualsByDate(null);
      setLoadingGoalActuals(false);
      return;
    }
    const controller = new AbortController();
    setLoadingGoalActuals(true);
    setGoalActualsByDate(null);
    const dates = DAY_ORDER.map((d) => addDaysToDate(weekStart, d));
    goalService
      .getDailyActuals(selectedLocation._id, dates, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setGoalActualsByDate(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setGoalActualsByDate(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingGoalActuals(false);
      });
    return () => controller.abort();
  }, [selectedLocation?._id, activeTab, currentWeekStart, selectedPreviousWeek]);

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
    if (!canEditAnyGoalMetric) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const baselineDefault = saved
        ? { ...DEFAULT_GOAL_VALUES, ...saved.default }
        : DEFAULT_GOAL_VALUES;
      const defaultToSave = mergeGoalValuesForSave(
        defaultGoals,
        baselineDefault,
        allowedGoalKeys
      );
      const weeklyToSave =
        Object.keys(weekly).length > 0
          ? mergeWeeklyForSave(weekly, saved?.weekly, allowedGoalKeys)
          : undefined;
      const futureToSave = mergeFutureWeeksForSave(
        futureWeeks,
        saved?.futureWeeks,
        allowedGoalKeys
      );

      const updated = await goalService.upsert({
        locationId: selectedLocation._id,
        default: defaultToSave,
        weekly:
          weeklyToSave && Object.keys(weeklyToSave).length > 0 ? weeklyToSave : undefined,
        futureWeeks: futureToSave,
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

  const renderGoalReadOnly = useCallback(
    (goal: Goal | null, actuals?: GoalDailyActuals | null) => (
      <GoalSettingFormFields
        mode="readonly"
        goal={goal}
        actuals={actuals}
        loadingActuals={loadingGoalActuals}
        allowedGoalKeys={allowedGoalKeys}
      />
    ),
    [loadingGoalActuals, allowedGoalKeys]
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
              <GoalSettingLocationDropdown
                locations={locations}
                locationsLoading={locationsLoading}
                selectedLocation={selectedLocation}
                hasUnsavedChanges={hasUnsavedChanges}
                onSelectLocation={setSelectedLocation}
                onPendingLocation={setPendingLocation}
              />
            </div>

            <GoalSettingMainContent
              hasLocation={!!selectedLocation?._id}
              loading={loading}
            >
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
                    <DefaultGoalsTab
                      defaultGoals={defaultGoals}
                      updateDefault={updateDefault}
                      allowedGoalKeys={allowedGoalKeys}
                    />
                  )}

                  {activeTab === 'weekly' && (
                    <WeeklyGoalsTab
                      currentWeekStart={currentWeekStart}
                      getWeeklyDay={getWeeklyDay}
                      updateWeeklyDay={updateWeeklyDay}
                      actualsByDate={goalActualsByDate}
                      loadingActuals={loadingGoalActuals}
                      allowedGoalKeys={allowedGoalKeys}
                    />
                  )}

                  {activeTab === 'future' && (
                    <FutureWeeksTab
                      futureWeeks={futureWeeks}
                      futureWeeksFiltered={futureWeeksFiltered}
                      futureWeeksExpanded={futureWeeksExpanded}
                      nextWeekStart={nextWeekStart}
                      addWeekAnchorEl={addWeekAnchorEl}
                      setAddWeekAnchorEl={setAddWeekAnchorEl}
                      setFutureWeekExpanded={setFutureWeekExpanded}
                      removeFutureWeek={removeFutureWeek}
                      getFutureWeekDay={getFutureWeekDay}
                      updateFutureWeekDay={updateFutureWeekDay}
                      updateFutureWeekStartDate={updateFutureWeekStartDate}
                      handleAddWeekClick={handleAddWeekClick}
                      handleAddWeekCalendarChange={handleAddWeekCalendarChange}
                      allowedGoalKeys={allowedGoalKeys}
                    />
                  )}

                  {activeTab === 'previous' && (
                    <PreviousGoalsTab
                      selectedPreviousWeek={selectedPreviousWeek}
                      lastWeekStart={lastWeekStart}
                      loadingPrevious={loadingPrevious}
                      previousGoalsByDay={previousGoalsByDay}
                      setSelectedPreviousWeek={setSelectedPreviousWeek}
                      renderGoalReadOnly={renderGoalReadOnly}
                      actualsByDate={goalActualsByDate}
                    />
                  )}

                  {activeTab !== 'previous' && canEditAnyGoalMetric && (
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
            </GoalSettingMainContent>
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
