import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import OperationsIcon from "@assets/icons/operations.svg?react";
import { Layout } from "../../components/common/Layout";
import {
  selectCurrentLocation,
  selectIsMultiLocationView,
  selectLocationApiParams,
} from "../../store/locationSelectors";
import { hasLocationSelection } from "../../utils/locationSelectionHelpers";
import type { KitchenPerformanceRow } from "../../types/kitchenPerformance.types";
import {
  KitchenPerformancePeriodPicker,
  KitchenPerformanceTableCard,
} from "../../components/KitchenPerformance";
import { useCanAccessComponent } from "../../hooks/useCanAccessComponent";
import type { KitchenPerformancePeriodValue } from "../../utils/kitchenPerformancePeriodRange";
import {
  inferPeriodFromDateRange,
  periodToDateRange,
  zonedWallTodayYmd,
} from "../../utils/kitchenPerformancePeriodRange";
import { resolveDisplayTimezone } from "../../utils/displayTimezoneHelpers";
import { useKitchenPerformanceReport } from "../../context/KitchenPerformanceReportContext";
import { buildKitchenPerformanceReportCacheKey } from "../../utils/kitchenPerformanceReportCache.util";

const PAGE_SIZE = 10;
const PAGE_ID = "kitchen-performance";

function isValidYmd(s: string | null): boolean {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

export const KitchenPerformance = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locationApiParams = useSelector(selectLocationApiParams);
  const isMultiLocationView = useSelector(selectIsMultiLocationView);
  const currentLocation = useSelector(selectCurrentLocation);
  const hasLocationScope = hasLocationSelection(locationApiParams);
  const canKitchenTable = useCanAccessComponent(PAGE_ID, "kitchen-performance");
  const { reportPayload, cacheKey, loading, runReport } = useKitchenPerformanceReport();
  const [page, setPage] = useState(1);

  const browserDefaultTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const timezone = useMemo(
    () => resolveDisplayTimezone(isMultiLocationView, currentLocation?.timezone, browserDefaultTz),
    [isMultiLocationView, currentLocation?.timezone, browserDefaultTz],
  );

  const startParam = searchParams.get("startDate");
  const endParam = searchParams.get("endDate");
  const legacyDate = searchParams.get("date");

  useEffect(() => {
    if (legacyDate && isValidYmd(legacyDate) && !startParam) {
      navigate(
        `/dashboard/kitchen-performance?startDate=${legacyDate}&endDate=${legacyDate}`,
        { replace: true },
      );
      return;
    }
    if (!isValidYmd(startParam) || !isValidYmd(endParam) || startParam! > endParam!) {
      const t = zonedWallTodayYmd(timezone);
      navigate(`/dashboard/kitchen-performance?startDate=${t}&endDate=${t}`, { replace: true });
    }
  }, [endParam, legacyDate, navigate, startParam, timezone]);

  const startDate = isValidYmd(startParam) ? startParam! : zonedWallTodayYmd(timezone);
  const endDate = isValidYmd(endParam) ? endParam! : startDate;

  const period = useMemo(
    () => inferPeriodFromDateRange(startDate, endDate, timezone),
    [startDate, endDate, timezone],
  );

  const activeCacheKey = useMemo(
    () => buildKitchenPerformanceReportCacheKey(locationApiParams, startDate, endDate),
    [locationApiParams, startDate, endDate],
  );

  const reportMatchesFilters = cacheKey === activeCacheKey;
  const hasReportData = reportPayload != null;

  const allRows = reportPayload?.listRows ?? [];
  const totalItems = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const rows = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return allRows.slice(startIndex, startIndex + PAGE_SIZE);
  }, [allRows, page]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  const handleRunReport = useCallback(async () => {
    if (!hasLocationScope || !canKitchenTable) return;
    setPage(1);
    try {
      await runReport(locationApiParams, { startDate, endDate });
    } catch {
      toast.error("Failed to run kitchen performance report.");
    }
  }, [
    canKitchenTable,
    endDate,
    hasLocationScope,
    locationApiParams,
    runReport,
    startDate,
  ]);

  const handlePeriodChange = (next: KitchenPerformancePeriodValue) => {
    if (next.periodType === "custom" && (!next.periodStart || !next.periodEnd)) {
      return;
    }
    try {
      const { startDate: s, endDate: e } = periodToDateRange(next, timezone);
      setPage(1);
      navigate(`/dashboard/kitchen-performance?startDate=${s}&endDate=${e}`);
    } catch {
      /* incomplete custom */
    }
  };

  const tableLoading = loading;
  const showEmptyInstruction = !hasReportData && !loading;
  const showStaleFiltersHint = hasReportData && !reportMatchesFilters && !loading;
  const runReportDisabled =
    loading || !hasLocationScope || (hasReportData && reportMatchesFilters);

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <OperationsIcon className="h-4 w-4 text-primary md:h-5 md:w-5 2xl:h-6 2xl:w-6" aria-hidden />
            Kitchen Performance
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {canKitchenTable ? (
              <KitchenPerformancePeriodPicker
                value={period}
                onChange={handlePeriodChange}
                timezone={timezone}
                className="min-w-[10rem]"
              />
            ) : null}
            {canKitchenTable && hasLocationScope ? (
              <button
                type="button"
                onClick={() => void handleRunReport()}
                disabled={runReportDisabled}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {loading ? "Running…" : "Run Report"}
              </button>
            ) : null}
          </div>
        </div>

        {canKitchenTable ? (
          <>
            {showStaleFiltersHint ? (
              <p className="mb-4 text-sm text-secondary">
                Location or period changed. Click Run Report to refresh the table.
              </p>
            ) : null}
            {showEmptyInstruction ? (
              <p className="mb-4 text-sm text-secondary">
                Select a period and click Run Report to load kitchen performance data.
              </p>
            ) : null}
            {!hasLocationScope ? (
              <p className="mb-4 text-sm text-secondary">
                Select at least one location to run a report.
              </p>
            ) : null}
            <KitchenPerformanceTableCard
              rows={rows}
              loading={tableLoading}
              emptyMessage={
                showEmptyInstruction
                  ? "No report run yet. Select a period and click Run Report."
                  : undefined
              }
              onView={(row: KitchenPerformanceRow) => {
                const encoded = encodeURIComponent(row.deviceName);
                const locationId = row.locationId ?? currentLocation?._id ?? "";
                const locationQuery = locationId ? `&locationId=${encodeURIComponent(locationId)}` : "";
                const linkStartDate = reportPayload?.meta.startDate ?? startDate;
                const linkEndDate = reportPayload?.meta.endDate ?? endDate;
                navigate(
                  `/dashboard/kitchen-performance/${encoded}?startDate=${linkStartDate}&endDate=${linkEndDate}${locationQuery}`,
                );
              }}
              pagination={
                hasReportData
                  ? {
                      currentPage: page,
                      totalPages,
                      totalItems,
                      pageSize: PAGE_SIZE,
                      onPageChange: setPage,
                    }
                  : undefined
              }
            />
          </>
        ) : (
          <p className="text-sm text-secondary">
            You do not have access to view kitchen performance data.
          </p>
        )}
      </div>
    </Layout>
  );
};
