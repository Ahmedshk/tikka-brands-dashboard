import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import TextField from "@mui/material/TextField";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { Dropdown, type DropdownOption } from "../../components/common/Dropdown";
import { integrationSyncService } from "../../services/integrationSync.service";
import type { IntegrationSyncLogRow } from "../../services/integrationSync.service";
import { locationService } from "../../services/location.service";
import type { LocationListItem } from "../../types";
import { DATA_SYNC_RESOURCE_OPTIONS } from "../../utils/dataSyncResourceOptions";
import {
  formatIntegrationSyncLogDetailsWithLocations,
  integrationSyncLogResourceLabel,
  integrationSyncLogStatusClassName,
} from "../../utils/integrationSyncLogDisplayHelpers";
import {
  formatCurrentStep,
  formatElapsed,
  formatStartedAtClock,
} from "../../utils/dataSyncProgressHelpers";
import {
  buildRetryBody,
  canRetryLog,
  getFailedLocationIds,
} from "../../utils/dataSyncRetryHelpers";
import { SyncLogDetailCell } from "../../components/dataSync/SyncLogDetailCell";
import { Pagination } from "../../components/common/Pagination";
import AdminAndSettingsIcon from "@assets/icons/admin_and_settings.svg?react";

const RECENT_RUNS_PAGE_SIZE = 10;
const ACTIVE_POLL_INTERVAL_MS = 3000;
const ELAPSED_TICK_MS = 1000;

const GREY_FOCUS_FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "#9CA3AF",
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: "#9CA3AF",
    },
  },
} as const;

const DATA_SYNC_DATETIME_FORMAT = "MM/dd/yyyy HH:mm";

/** Nested panel — aligned with Events & Notifications / event types table card. */
const nestedPanelClass =
  "bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden";

const logThFirstColClass =
  "text-left font-semibold px-4 lg:px-6 py-3 lg:py-4 text-[10px] md:text-xs 2xl:text-sm text-white";
const logThClass =
  "font-semibold px-4 lg:px-6 py-3 lg:py-4 text-[10px] md:text-xs 2xl:text-sm text-white text-left";
const logTdFirstColClass = "px-4 lg:px-6 py-3 lg:py-4 whitespace-nowrap align-top";

function formatLogWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export const DataSyncSettings = () => {
  const [logsLoading, setLogsLoading] = useState(true);
  const [runStarting, setRunStarting] = useState(false);
  const [runAllTodayStarting, setRunAllTodayStarting] = useState(false);
  const [logs, setLogs] = useState<IntegrationSyncLogRow[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [resource, setResource] = useState(DATA_SYNC_RESOURCE_OPTIONS[0]!.value);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [activeSyncs, setActiveSyncs] = useState<IntegrationSyncLogRow[]>([]);
  const [nowTick, setNowTick] = useState(0);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const activeIdsRef = useRef<Set<string>>(new Set());

  const locationNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const loc of locations) {
      map[loc._id] = loc.storeName;
    }
    return map;
  }, [locations]);

  const resourceMeta = useMemo(
    () => DATA_SYNC_RESOURCE_OPTIONS.find((o) => o.value === resource),
    [resource],
  );

  const resourceDropdownOptions: DropdownOption[] = useMemo(
    () =>
      DATA_SYNC_RESOURCE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    [],
  );

  const fetchLogsForPage = useCallback(async (page: number) => {
    setLogsLoading(true);
    try {
      const res = await integrationSyncService.getLogs({
        page,
        limit: RECENT_RUNS_PAGE_SIZE,
      });
      const maxPage = Math.max(1, Math.ceil(res.total / RECENT_RUNS_PAGE_SIZE));
      if (res.total > 0 && page > maxPage) {
        const res2 = await integrationSyncService.getLogs({
          page: maxPage,
          limit: RECENT_RUNS_PAGE_SIZE,
        });
        setLogs(res2.logs);
        setLogsTotal(res2.total);
        setLogsPage(maxPage);
      } else {
        setLogs(res.logs);
        setLogsTotal(res.total);
      }
    } catch {
      toast.error("Failed to load sync history");
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLogsForPage(1);
  }, [fetchLogsForPage]);

  const goToLogsPage = useCallback(
    (page: number) => {
      setLogsPage(page);
      void fetchLogsForPage(page);
    },
    [fetchLogsForPage],
  );

  const refreshLogs = useCallback(() => {
    void fetchLogsForPage(logsPage);
  }, [fetchLogsForPage, logsPage]);

  const logsTotalPages = Math.max(1, Math.ceil(logsTotal / RECENT_RUNS_PAGE_SIZE));

  const fetchActive = useCallback(async (): Promise<IntegrationSyncLogRow[]> => {
    try {
      const res = await integrationSyncService.getActive();
      const next = res.active;
      const previousIds = activeIdsRef.current;
      const nextIds = new Set(next.map((row) => row._id));

      const finishedIds: string[] = [];
      previousIds.forEach((id) => {
        if (!nextIds.has(id)) finishedIds.push(id);
      });

      activeIdsRef.current = nextIds;
      setActiveSyncs(next);

      if (finishedIds.length > 0) {
        toast.success(
          finishedIds.length === 1
            ? "A sync finished — see Recent runs for details"
            : `${finishedIds.length} syncs finished — see Recent runs for details`,
        );
        void fetchLogsForPage(logsPage);
      }
      return next;
    } catch {
      return [];
    }
  }, [fetchLogsForPage, logsPage]);

  useEffect(() => {
    void fetchActive();
    const interval = globalThis.setInterval(() => {
      void fetchActive();
    }, ACTIVE_POLL_INTERVAL_MS);
    return () => {
      globalThis.clearInterval(interval);
    };
  }, [fetchActive]);

  useEffect(() => {
    if (activeSyncs.length === 0) return;
    const tick = globalThis.setInterval(() => {
      setNowTick((n) => n + 1);
    }, ELAPSED_TICK_MS);
    return () => {
      globalThis.clearInterval(tick);
    };
  }, [activeSyncs.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await locationService.getAll();
        if (cancelled) return;
        setLocations(list);
      } catch {
        if (!cancelled) toast.error("Failed to load locations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLocation = (id: string) => {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleRun = async () => {
    if (resourceMeta?.needsDateRange && (!startDate || !endDate)) {
      toast.error("Start and end date are required for this resource");
      return;
    }
    setRunStarting(true);
    try {
      const body = {
        resource,
        ...(selectedLocationIds.length ? { locationIds: selectedLocationIds } : {}),
        ...(startDate ? { startDate: startDate.toISOString() } : {}),
        ...(endDate ? { endDate: endDate.toISOString() } : {}),
      };
      await integrationSyncService.run(body);
      toast.success("Sync started — progress will appear below");
      await fetchActive();
    } catch {
      toast.error("Sync request failed");
    } finally {
      setRunStarting(false);
    }
  };

  const handleRunAllToday = async () => {
    setRunAllTodayStarting(true);
    try {
      await integrationSyncService.runAllToday();
      toast.success("Full sync started — progress will appear below");
      await fetchActive();
    } catch {
      toast.error("Full sync request failed");
    } finally {
      setRunAllTodayStarting(false);
    }
  };

  const handleRetry = async (row: IntegrationSyncLogRow) => {
    const body = buildRetryBody(row);
    if (!body) {
      toast.error("This run is not retryable");
      return;
    }
    setRetryingLogId(row._id);
    try {
      await integrationSyncService.run(body);
      toast.success("Retry started — progress will appear above");
      await fetchActive();
    } catch {
      toast.error("Retry request failed");
    } finally {
      setRetryingLogId(null);
    }
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminAndSettingsIcon
              className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary shrink-0"
              aria-hidden
            />
            Data Sync
          </h2>
        </div>

        <div className="bg-card-background rounded-xl overflow-hidden">
          <div className="h-4 rounded-t-xl bg-primary" aria-hidden />
          <div className="p-6">
            <div className="space-y-8">
              <div>
                <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">
                  Run sync
                </h3>
                <p className="text-xs text-tertiary mt-1 max-w-2xl">
                  On-demand backfills for Square, Homebase, and MarketMan. For Homebase timecards and
                  MarketMan orders, choose a start and end (same as Square payments). Scheduled jobs keep
                  MarketMan orders (and valid count dates once daily) plus a rolling Homebase window updated;
                  actual/theoretical and waste cost for Inventory &amp; Food Cost load from MarketMan on first
                  use per count period and are then read from the database (no TTL yet).
                </p>
                <div className="mt-4 space-y-4">
                  <div>
                    <span className="block text-sm font-medium text-primary mb-1">Resource</span>
                    <Dropdown
                      value={resource}
                      options={resourceDropdownOptions}
                      onChange={(v) => setResource(v as typeof resource)}
                      placeholder="Select resource"
                      allowEmpty={false}
                      aria-label="Integration resource"
                    />
                  </div>
                  {resourceMeta?.needsDateRange ? (
                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="data-sync-start"
                            className="block text-sm font-medium text-primary mb-1"
                          >
                            Start
                          </label>
                          <DateTimePicker
                            value={startDate}
                            onChange={setStartDate}
                            format={DATA_SYNC_DATETIME_FORMAT}
                            enableAccessibleFieldDOMStructure={false}
                            slots={{ textField: TextField }}
                            slotProps={{
                              textField: {
                                id: "data-sync-start",
                                size: "small",
                                placeholder: "MM/DD/YYYY HH:mm",
                                fullWidth: true,
                                sx: GREY_FOCUS_FIELD_SX,
                              },
                            }}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="data-sync-end"
                            className="block text-sm font-medium text-primary mb-1"
                          >
                            End
                          </label>
                          <DateTimePicker
                            value={endDate}
                            onChange={setEndDate}
                            format={DATA_SYNC_DATETIME_FORMAT}
                            enableAccessibleFieldDOMStructure={false}
                            slots={{ textField: TextField }}
                            slotProps={{
                              textField: {
                                id: "data-sync-end",
                                size: "small",
                                placeholder: "MM/DD/YYYY HH:mm",
                                fullWidth: true,
                                sx: GREY_FOCUS_FIELD_SX,
                              },
                            }}
                          />
                        </div>
                      </div>
                    </LocalizationProvider>
                  ) : null}
                  <div>
                    <span className="block text-sm font-medium text-primary mb-2">
                      Locations (optional — leave empty for all)
                    </span>
                    <div
                      className={`max-h-40 overflow-y-auto p-3 space-y-1 ${nestedPanelClass}`}
                    >
                      {locations.length === 0 ? (
                        <p className="text-sm text-secondary py-2 px-1">No locations found.</p>
                      ) : (
                        locations.map((loc) => (
                          <label
                            key={loc._id}
                            className="flex items-center gap-2 text-sm text-primary cursor-pointer py-0.5 px-1 rounded hover:bg-[#F3F5F7]"
                          >
                            <input
                              type="checkbox"
                              className="rounded border-gray-300"
                              checked={selectedLocationIds.includes(loc._id)}
                              onChange={() => toggleLocation(loc._id)}
                            />
                            {loc.storeName}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={runStarting}
                      onClick={() => void handleRun()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {runStarting ? "Starting…" : "Run sync"}
                    </button>
                  </div>

                  <div className="border-t border-gray-200 pt-6 mt-6 space-y-4">
                    <h4 className="text-sm font-semibold text-primary">Sync all for today</h4>
                    <p className="text-xs text-tertiary max-w-2xl">
                      Runs every integration resource for all locations in one job. Square payments,
                      orders, and Homebase timecards use each location&apos;s local calendar day (from
                      its timezone). MarketMan order syncs use the same &quot;today&quot; windows as
                      scheduled jobs when no custom range is set. This can take several minutes and
                      calls external APIs heavily.
                    </p>
                    <div>
                      <button
                        type="button"
                        disabled={runAllTodayStarting}
                        onClick={() => void handleRunAllToday()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-button-primary border border-button-primary text-xs md:text-sm rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {runAllTodayStarting ? "Starting…" : "Sync all for today"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-gray-200" />

              {activeSyncs.length > 0 && (
                <div data-tick={nowTick}>
                  <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">
                    In-progress syncs
                  </h3>
                  <p className="text-xs text-tertiary mt-1 max-w-2xl">
                    Active syncs persist on the server, so this list keeps updating even if you
                    leave the page and come back.
                  </p>
                  <div className={`mt-3 ${nestedPanelClass}`}>
                    <ul className="divide-y divide-gray-200">
                      {activeSyncs.map((row) => (
                        <li key={row._id} className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-primary truncate">
                                {integrationSyncLogResourceLabel(row.resource)}
                              </p>
                              <p className="text-[11px] text-secondary break-words mt-1">
                                {formatCurrentStep(row.progress)}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-button-primary/10 text-button-primary text-[11px] font-medium self-start shrink-0">
                              <span className="relative flex h-2 w-2" aria-hidden>
                                <span className="absolute inline-flex h-full w-full rounded-full bg-button-primary opacity-60 animate-ping" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-button-primary" />
                              </span>
                              <span>Running</span>
                            </span>
                          </div>
                          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                            <div className="flex gap-1">
                              <dt className="text-tertiary">Started:</dt>
                              <dd className="text-primary font-medium">
                                {formatStartedAtClock(row.createdAt)}
                              </dd>
                            </div>
                            <div className="flex gap-1">
                              <dt className="text-tertiary">Running for:</dt>
                              <dd className="text-primary font-medium font-mono">
                                {formatElapsed(row.createdAt)}
                              </dd>
                            </div>
                            {row.locationIds.length > 0 && (
                              <div className="flex gap-1">
                                <dt className="text-tertiary">Locations:</dt>
                                <dd className="text-primary font-medium">
                                  {row.locationIds.length}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {activeSyncs.length > 0 && <hr className="border-gray-200" />}

              <div>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">
                      Recent runs
                    </h3>
                    <p className="text-xs text-tertiary mt-1 max-w-2xl">
                      Integration sync results, newest first ({RECENT_RUNS_PAGE_SIZE} per page).
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-button-primary hover:opacity-90 transition-opacity cursor-pointer shrink-0 self-start disabled:opacity-50"
                    disabled={logsLoading}
                    onClick={() => {
                      refreshLogs();
                    }}
                  >
                    Refresh
                  </button>
                </div>

                {logsLoading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-4 text-primary">
                    <Spinner size="xl" className="text-button-primary" />
                    <span className="text-sm">Loading history…</span>
                  </div>
                )}
                {!logsLoading && logs.length === 0 && (
                  <p className="text-sm text-secondary py-4">No sync logs yet.</p>
                )}
                {!logsLoading && logs.length > 0 && (
                  <div className={nestedPanelClass}>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full table-fixed border-collapse text-[10px] md:text-xs 2xl:text-sm">
                        <colgroup>
                          <col className="w-[11rem] lg:w-[13rem]" />
                          <col className="w-[min(12rem,22%)]" />
                          <col className="w-[5.5rem]" />
                          <col />
                        </colgroup>
                        <thead>
                          <tr className="bg-primary text-white">
                            <th className={logThFirstColClass}>When</th>
                            <th className={logThClass}>Resource</th>
                            <th className={logThClass}>Status</th>
                            <th className={logThClass}>Detail</th>
                          </tr>
                        </thead>
                        <tbody className="text-primary">
                          {logs.map((row, index) => (
                            <tr
                              key={row._id}
                              className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}
                            >
                              <td className={logTdFirstColClass}>{formatLogWhen(row.createdAt)}</td>
                              <td className="px-4 lg:px-6 py-3 lg:py-4 font-mono text-[10px] md:text-xs align-top break-all">
                                {row.resource}
                              </td>
                              <td className="px-4 lg:px-6 py-3 lg:py-4 align-top">
                                <span className={integrationSyncLogStatusClassName(row.status)}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-4 lg:px-6 py-3 lg:py-4 align-top min-w-0">
                                <SyncLogDetailCell
                                  detailText={formatIntegrationSyncLogDetailsWithLocations(
                                    row,
                                    locationNameById,
                                  )}
                                />
                                {canRetryLog(row) && (
                                  <button
                                    type="button"
                                    disabled={retryingLogId === row._id}
                                    onClick={() => void handleRetry(row)}
                                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-button-primary text-white text-[11px] rounded-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {retryingLogId === row._id
                                      ? "Starting…"
                                      : `Retry failed locations (${getFailedLocationIds(row).length})`}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="md:hidden flex flex-col rounded-t-xl overflow-hidden">
                      <div className="p-5 flex flex-col">
                        <div className="divide-y divide-gray-200 -mx-5 px-5">
                          {logs.map((row, index) => (
                            <div
                              key={`${row._id}-mobile`}
                              className={`px-3 py-3 ${index % 2 === 1 ? "bg-[#F3F5F7]" : "bg-white"}`}
                            >
                              <p className="text-xs font-mono text-primary break-all">
                                {integrationSyncLogResourceLabel(row.resource)}
                              </p>
                              <p className="text-sm font-medium text-primary mt-1">
                                {formatLogWhen(row.createdAt)}
                              </p>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                                <div className="flex items-center gap-2">
                                  <span className="text-secondary shrink-0">Status:</span>
                                  <span className={integrationSyncLogStatusClassName(row.status)}>
                                    {row.status}
                                  </span>
                                </div>
                                <div className="flex items-start gap-2 min-w-0">
                                  <span className="text-secondary shrink-0">Detail:</span>
                                  <div className="min-w-0 flex-1">
                                    <SyncLogDetailCell
                                      detailText={formatIntegrationSyncLogDetailsWithLocations(
                                        row,
                                        locationNameById,
                                      )}
                                      textClassName="text-primary"
                                    />
                                  </div>
                                </div>
                                {canRetryLog(row) && (
                                  <div>
                                    <button
                                      type="button"
                                      disabled={retryingLogId === row._id}
                                      onClick={() => void handleRetry(row)}
                                      className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 bg-button-primary text-white text-[11px] rounded-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {retryingLogId === row._id
                                        ? "Starting…"
                                        : `Retry failed locations (${getFailedLocationIds(row).length})`}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {logsTotalPages > 1 && (
                      <Pagination
                        currentPage={logsPage}
                        totalPages={logsTotalPages}
                        totalItems={logsTotal}
                        pageSize={RECENT_RUNS_PAGE_SIZE}
                        onPageChange={goToLogsPage}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
