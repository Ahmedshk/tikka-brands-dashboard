import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { disciplinaryManagementService } from "../services/disciplinaryManagement.service";
import type { DisciplinaryRow } from "../types/disciplinaryManagement.types";

const PAGE_SIZE = 10;

async function runDisciplinaryLoad(params: {
  locationId: string;
  pageParam: number;
  searchParam: string;
  signal: AbortSignal;
}): Promise<Awaited<ReturnType<typeof disciplinaryManagementService.getEmployees>>> {
  const { locationId, pageParam, searchParam, signal } = params;
  return disciplinaryManagementService.getEmployees(
    locationId,
    { page: pageParam, limit: PAGE_SIZE, search: searchParam },
    { signal },
  );
}

export function useDisciplinaryManagementData(params: {
  locationId: string | null;
  canDisciplinaryRecords: boolean;
  needsKpiData: boolean;
  debouncedSearch: string;
  page: number;
  setPage: (page: number) => void;
}) {
  const { locationId, canDisciplinaryRecords, needsKpiData, debouncedSearch, page, setPage } = params;

  const [rows, setRows] = useState<DisciplinaryRow[]>([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [criticalCount, setCriticalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalActive, setTotalActive] = useState(0);

  const requirements = useMemo(() => {
    const needTable = canDisciplinaryRecords;
    const needKpi = needsKpiData;
    const shouldLoad = Boolean(locationId && (needTable || needKpi));
    return {
      shouldLoad,
      needTable,
      needKpi,
      pageParam: needTable ? page : 1,
      searchParam: needTable ? debouncedSearch : "",
    };
  }, [canDisciplinaryRecords, needsKpiData, locationId, page, debouncedSearch]);

  const resetTable = () => {
    setRows([]);
    setTotalItems(0);
    setTotalPages(1);
  };

  const resetKpis = () => {
    setCriticalCount(0);
    setPendingCount(0);
    setTotalActive(0);
  };

  const setLoadingState = (needTable: boolean, needKpi: boolean, loading: boolean) => {
    if (needTable) setTableLoading(loading);
    if (needKpi) setKpiLoading(loading);
  };

  useEffect(() => {
    const { shouldLoad, needTable, needKpi, pageParam, searchParam } = requirements;

    if (!shouldLoad) {
      if (!needTable) {
        resetTable();
      }
      if (!needKpi) {
        resetKpis();
      }
      setTableLoading(false);
      setKpiLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoadingState(needTable, needKpi, true);

    (async () => {
      try {
        const locId = locationId;
        if (!locId) return;
        const data = await runDisciplinaryLoad({
          locationId: locId,
          pageParam,
          searchParam,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;

        if (needKpi) {
          setCriticalCount(data.meta.criticalCount);
          setPendingCount(data.meta.pendingCount);
          setTotalActive(data.meta.totalActive);
        }
        if (needTable) {
          setRows(data.rows);
          setTotalItems(data.meta.total);
          setTotalPages(data.meta.totalPages);
          if (data.meta.page !== page) setPage(data.meta.page);
        }
      } catch (e: unknown) {
        if (axios.isCancel(e) || (e as { code?: string })?.code === "ERR_CANCELED") return;
        if (ac.signal.aborted) return;

        toast.error(needTable ? "Failed to load employees" : "Failed to load KPI metrics");
        if (needKpi) {
          resetKpis();
        }
        if (needTable) {
          resetTable();
        }
      } finally {
        if (!ac.signal.aborted) setLoadingState(needTable, needKpi, false);
      }
    })();

    return () => ac.abort();
  }, [requirements, locationId, page, setPage]);

  return {
    rows,
    tableLoading,
    kpiLoading,
    totalItems,
    totalPages,
    criticalCount,
    pendingCount,
    totalActive,
  };
}

