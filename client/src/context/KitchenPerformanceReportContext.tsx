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
  KitchenPerformanceTicketModifiersLookup,
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
  detailsLoading: boolean;
  detailsError: string | null;
  runReport: (
    locationApiParams: LocationApiParams,
    range: KitchenPerformanceDateRange,
  ) => Promise<void>;
  clearReport: () => void;
  getDetails: (
    locationId: string,
    deviceName: string,
  ) => KitchenPerformanceDetails | null;
  fetchDetails: (
    locationId: string,
    deviceName: string,
    range: KitchenPerformanceDateRange,
  ) => Promise<KitchenPerformanceDetails>;
  fetchTicketModifiers: (
    locationId: string,
    range: KitchenPerformanceDateRange,
    orderIds: string[],
  ) => Promise<KitchenPerformanceTicketModifiersLookup>;
}

const KitchenPerformanceReportContext =
  createContext<KitchenPerformanceReportContextValue | null>(null);

export function KitchenPerformanceReportProvider({ children }: { children: ReactNode }) {
  const [reportPayload, setReportPayload] = useState<KitchenPerformanceReportPayload | null>(
    null,
  );
  const [detailsCache, setDetailsCache] = useState<
    Record<string, KitchenPerformanceDetails>
  >({});
  const [cacheKey, setCacheKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const clearReport = useCallback(() => {
    setReportPayload(null);
    setDetailsCache({});
    setCacheKey(null);
    setError(null);
    setDetailsError(null);
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
        setDetailsCache({});
        setCacheKey(nextCacheKey);
      } catch (err) {
        setReportPayload(null);
        setDetailsCache({});
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
      const key = buildKitchenPerformanceDetailsCacheKey(locationId, deviceName);
      return detailsCache[key] ?? null;
    },
    [detailsCache],
  );

  const fetchDetails = useCallback(
    async (
      locationId: string,
      deviceName: string,
      range: KitchenPerformanceDateRange,
    ): Promise<KitchenPerformanceDetails> => {
      const key = buildKitchenPerformanceDetailsCacheKey(locationId, deviceName);
      const cached = detailsCache[key];
      if (cached) return cached;

      setDetailsLoading(true);
      setDetailsError(null);
      try {
        const details = await kitchenPerformanceService.getReportDetails(
          locationId,
          range,
          deviceName,
        );
        setDetailsCache((prev) => ({ ...prev, [key]: details }));
        return details;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load kitchen performance details.";
        setDetailsError(message);
        throw err;
      } finally {
        setDetailsLoading(false);
      }
    },
    [detailsCache],
  );

  const fetchTicketModifiers = useCallback(
    async (
      locationId: string,
      range: KitchenPerformanceDateRange,
      orderIds: string[],
    ): Promise<KitchenPerformanceTicketModifiersLookup> => {
      return kitchenPerformanceService.getReportTicketModifiers(
        locationId,
        range,
        orderIds,
      );
    },
    [],
  );

  const value = useMemo(
    () => ({
      reportPayload,
      cacheKey,
      loading,
      error,
      detailsLoading,
      detailsError,
      runReport,
      clearReport,
      getDetails,
      fetchDetails,
      fetchTicketModifiers,
    }),
    [
      reportPayload,
      cacheKey,
      loading,
      error,
      detailsLoading,
      detailsError,
      runReport,
      clearReport,
      getDetails,
      fetchDetails,
      fetchTicketModifiers,
    ],
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
