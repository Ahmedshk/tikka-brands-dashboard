import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LocationApiParams } from "../utils/locationSelectionHelpers";
import {
  kitchenPerformanceService,
  type KitchenPerformanceDateRange,
} from "../services/kitchenPerformance.service";
import type {
  KitchenPerformanceDetails,
  KitchenPerformanceReportPayload,
} from "../types/kitchenPerformance.types";
import {
  buildKitchenPerformanceDetailsCacheKey,
  buildKitchenPerformanceReportCacheKey,
} from "../utils/kitchenPerformanceReportCache.util";

interface KitchenPerformanceReportContextValue {
  reportPayload: KitchenPerformanceReportPayload | null;
  cacheKey: string | null;
  loading: boolean;
  error: string | null;
  runReport: (
    locationApiParams: LocationApiParams,
    range: KitchenPerformanceDateRange,
  ) => Promise<void>;
  clearReport: () => void;
  getDetails: (
    locationId: string,
    deviceName: string,
  ) => KitchenPerformanceDetails | null;
}

const KitchenPerformanceReportContext =
  createContext<KitchenPerformanceReportContextValue | null>(null);

export function KitchenPerformanceReportProvider({ children }: { children: ReactNode }) {
  const [reportPayload, setReportPayload] = useState<KitchenPerformanceReportPayload | null>(
    null,
  );
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearReport = useCallback(() => {
    setReportPayload(null);
    setCacheKey(null);
    setError(null);
  }, []);

  const runReport = useCallback(
    async (locationApiParams: LocationApiParams, range: KitchenPerformanceDateRange) => {
      const nextCacheKey = buildKitchenPerformanceReportCacheKey(
        locationApiParams,
        range.startDate,
        range.endDate,
      );
      setLoading(true);
      setError(null);
      try {
        const payload = await kitchenPerformanceService.runReport(locationApiParams, range);
        setReportPayload(payload);
        setCacheKey(nextCacheKey);
      } catch (err) {
        setReportPayload(null);
        setCacheKey(null);
        const message =
          err instanceof Error ? err.message : "Failed to run kitchen performance report.";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const getDetails = useCallback(
    (locationId: string, deviceName: string): KitchenPerformanceDetails | null => {
      if (!reportPayload) return null;
      const key = buildKitchenPerformanceDetailsCacheKey(locationId, deviceName);
      return reportPayload.detailsByKey[key] ?? null;
    },
    [reportPayload],
  );

  const value = useMemo(
    () => ({
      reportPayload,
      cacheKey,
      loading,
      error,
      runReport,
      clearReport,
      getDetails,
    }),
    [reportPayload, cacheKey, loading, error, runReport, clearReport, getDetails],
  );

  return (
    <KitchenPerformanceReportContext.Provider value={value}>
      {children}
    </KitchenPerformanceReportContext.Provider>
  );
}

export function useKitchenPerformanceReport(): KitchenPerformanceReportContextValue {
  const ctx = useContext(KitchenPerformanceReportContext);
  if (!ctx) {
    throw new Error("useKitchenPerformanceReport must be used within KitchenPerformanceReportProvider");
  }
  return ctx;
}
