import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import OperationsIcon from "@assets/icons/operations.svg?react";
import ImportIcon from "@assets/icons/import.svg?react";
import { Layout } from "../../components/common/Layout";
import {
  selectCurrentLocation,
  selectIsMultiLocationView,
  selectLocationApiParams,
  selectSelectedLocations,
} from "../../store/locationSelectors";
import { hasLocationSelection } from "../../utils/locationSelectionHelpers";
import type { KitchenPerformanceRow } from "../../types/kitchenPerformance.types";
import { kitchenPerformanceService } from "../../services/kitchenPerformance.service";
import {
  KitchenPerformanceImportModal,
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
  const selectedLocations = useSelector(selectSelectedLocations);
  const hasLocationScope = hasLocationSelection(locationApiParams);
  const canImportCsv = useCanAccessComponent(PAGE_ID, "import-csv");
  const canKitchenTable = useCanAccessComponent(PAGE_ID, "kitchen-performance");
  const [rows, setRows] = useState<KitchenPerformanceRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);

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

  const fetchKitchenRows = useCallback(async () => {
    if (!hasLocationScope || !canKitchenTable) {
      setRows([]);
      setTotalItems(0);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await kitchenPerformanceService.getRows(
        locationApiParams,
        { startDate, endDate },
        { page, limit: PAGE_SIZE },
      );
      setRows(data.rows);
      setTotalItems(data.meta.total);
      setTotalPages(data.meta.totalPages);
      if (data.meta.page !== page) {
        setPage(data.meta.page);
      }
    } catch {
      setRows([]);
      setTotalItems(0);
      setTotalPages(1);
      toast.error("Failed to load kitchen performance.");
    } finally {
      setLoading(false);
    }
  }, [locationApiParams, hasLocationScope, page, startDate, endDate, canKitchenTable]);

  useEffect(() => {
    fetchKitchenRows();
  }, [fetchKitchenRows]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

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

  const handleImport = async (
    locationId: string,
    range: { startDate: string; endDate: string },
    file: File,
  ) => {
    const result = await kitchenPerformanceService.importCsv(locationId, range, file);
    toast.success(
      result.daysUpdated?.length
        ? `Kitchen performance imported (${result.importedRows} rows, ${result.daysUpdated.length} day(s)).`
        : `Kitchen performance imported (${result.importedRows} rows).`,
    );
    setPage(1);
    navigate(
      `/dashboard/kitchen-performance?startDate=${range.startDate}&endDate=${range.endDate}`,
    );
    await fetchKitchenRows();
  };

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
            {canImportCsv && selectedLocations.length > 0 ? (
              <button
                type="button"
                onClick={() => setImportModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                <ImportIcon className="w-4 h-4" />
                Import CSV
              </button>
            ) : null}
          </div>
        </div>

        {canKitchenTable ? (
          <KitchenPerformanceTableCard
            rows={rows}
            loading={loading}
            onView={(row) => {
              const encoded = encodeURIComponent(row.deviceName);
              navigate(
                `/dashboard/kitchen-performance/${encoded}?startDate=${startDate}&endDate=${endDate}`,
              );
            }}
            pagination={{
              currentPage: page,
              totalPages,
              totalItems,
              pageSize: PAGE_SIZE,
              onPageChange: setPage,
            }}
          />
        ) : (
          <p className="text-sm text-secondary">
            You do not have access to view kitchen performance data.
          </p>
        )}
      </div>

      <KitchenPerformanceImportModal
        isOpen={canImportCsv && importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImport}
        defaultPeriod={period}
        timezone={timezone}
        locations={selectedLocations}
      />
    </Layout>
  );
};
