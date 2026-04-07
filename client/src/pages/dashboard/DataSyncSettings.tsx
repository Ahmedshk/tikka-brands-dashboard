import { useCallback, useEffect, useMemo, useState } from "react";
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
  formatIntegrationSyncLogDetails,
  integrationSyncLogResourceLabel,
  integrationSyncLogStatusClassName,
} from "../../utils/integrationSyncLogDisplayHelpers";
import { SyncLogDetailCell } from "../../components/dataSync/SyncLogDetailCell";
import { Pagination } from "../../components/common/Pagination";
import AdminAndSettingsIcon from "@assets/icons/admin_and_settings.svg?react";

const RECENT_RUNS_PAGE_SIZE = 10;

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
  const [runLoading, setRunLoading] = useState(false);
  const [runAllTodayLoading, setRunAllTodayLoading] = useState(false);
  const [logs, setLogs] = useState<IntegrationSyncLogRow[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [resource, setResource] = useState(DATA_SYNC_RESOURCE_OPTIONS[0]!.value);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await locationService.getAll();
        if (!cancelled) setLocations(list);
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
    setRunLoading(true);
    try {
      const body = {
        resource,
        ...(selectedLocationIds.length ? { locationIds: selectedLocationIds } : {}),
        ...(startDate ? { startDate: startDate.toISOString() } : {}),
        ...(endDate ? { endDate: endDate.toISOString() } : {}),
      };
      const res = await integrationSyncService.run(body);
      if (res.ok) {
        toast.success(`Sync finished — ${res.totalUpserted} upserted`);
      } else {
        toast.error("Sync completed with errors (see history)");
      }
      if (logsPage === 1) await fetchLogsForPage(1);
      else goToLogsPage(1);
    } catch {
      toast.error("Sync request failed");
    } finally {
      setRunLoading(false);
    }
  };

  const handleRunAllToday = async () => {
    setRunAllTodayLoading(true);
    try {
      const res = await integrationSyncService.runAllToday();
      if (res.ok) {
        toast.success(
          `Full sync finished — ${res.totalUpserted} total upserts across ${res.steps.length} resources`,
        );
      } else {
        const failed = res.steps.filter((s) => !s.ok).map((s) => s.resource);
        toast.error(
          `Sync finished with errors in: ${failed.length ? failed.join(", ") : "unknown"}`,
        );
      }
      if (logsPage === 1) await fetchLogsForPage(1);
      else goToLogsPage(1);
    } catch {
      toast.error("Full sync request failed");
    } finally {
      setRunAllTodayLoading(false);
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
                      disabled={runLoading || runAllTodayLoading}
                      onClick={() => void handleRun()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {runLoading ? "Running…" : "Run sync"}
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
                        disabled={runLoading || runAllTodayLoading}
                        onClick={() => void handleRunAllToday()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-button-primary border border-button-primary text-xs md:text-sm rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {runAllTodayLoading ? "Syncing all…" : "Sync all for today"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <hr className="border-gray-200" />

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
                                  detailText={formatIntegrationSyncLogDetails(row)}
                                />
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
                                      detailText={formatIntegrationSyncLogDetails(row)}
                                      textClassName="text-primary"
                                    />
                                  </div>
                                </div>
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
