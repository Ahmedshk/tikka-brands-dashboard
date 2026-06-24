import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import OperationsIcon from "@assets/icons/operations.svg?react";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { zonedWallTodayYmd } from "../../utils/kitchenPerformancePeriodRange";
import { selectCurrentLocation } from "../../store/locationSelectors";
import { useCanAccessComponent } from "../../hooks/useCanAccessComponent";
import { KitchenPerformanceCompletedAtFilter } from "../../components/KitchenPerformance/KitchenPerformanceCompletedAtFilter";
import { KitchenPerformanceDetailsItemTab } from "../../components/KitchenPerformance/KitchenPerformanceDetailsItemTab";
import { KitchenPerformanceDetailsTicketTab } from "../../components/KitchenPerformance/KitchenPerformanceDetailsTicketTab";
import {
  KitchenPerformanceItemTicketsModal,
  KitchenPerformanceTicketDetailModal,
} from "../../components/KitchenPerformance";
import { ticketRowIncludesItemName } from "../../utils/kitchenPerformanceItemsInTicket";
import {
  hasActiveCompletedAtFilter,
  isTicketCompletedInRange,
} from "../../utils/kitchenPerformanceCompletedAtFilter.util";
import {
  computeKitchenPerformanceHourlyFromTicketRows,
  computeKitchenPerformanceTicketTabKpisFromRows,
} from "../../utils/kitchenPerformanceTicketTabFromRows.util";
import {
  formatYmdShort,
  isValidYmd,
} from "../../utils/kitchenPerformanceDetailsDateHelpers";
import { resolveDisplayTimezone } from "../../utils/displayTimezoneHelpers";
import { buildKitchenPerformanceListUrl } from "../../utils/kitchenPerformanceNavigationHelpers";
import { useKitchenPerformanceReport } from "../../context/KitchenPerformanceReportContext";
import type {
  KitchenPerformanceDetails as KitchenPerformanceDetailsData,
  KitchenPerformanceTicketRow,
} from "../../types/kitchenPerformance.types";

const DETAILS_PAGE_ID = "kitchen-performance-details";

type DetailsTab = "ticket-performance" | "item-performance";

export const KitchenPerformanceDetails = () => {
  const navigate = useNavigate();
  const { deviceName: encodedDeviceName } = useParams<{ deviceName: string }>();
  const [searchParams] = useSearchParams();
  const currentLocation = useSelector(selectCurrentLocation);
  const canFullPage = useCanAccessComponent(DETAILS_PAGE_ID, "full-page");
  const { getDetails, fetchDetails, detailsLoading, detailsError } =
    useKitchenPerformanceReport();
  const [activeTab, setActiveTab] = useState<DetailsTab>("ticket-performance");
  const [ticketDetailRow, setTicketDetailRow] = useState<KitchenPerformanceTicketRow | null>(
    null,
  );
  const [itemTicketsModal, setItemTicketsModal] = useState<{ itemName: string } | null>(null);
  const [completedAtStart, setCompletedAtStart] = useState("");
  const [completedAtEnd, setCompletedAtEnd] = useState("");

  const browserDefaultTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const timezone = currentLocation?.timezone?.trim() || browserDefaultTz;
  const displayTimezone = useMemo(
    () => resolveDisplayTimezone(false, currentLocation?.timezone, browserDefaultTz),
    [currentLocation?.timezone, browserDefaultTz],
  );

  const startParam = searchParams.get("startDate");
  const endParam = searchParams.get("endDate");
  const legacyDate = searchParams.get("date");
  const locationIdParam = searchParams.get("locationId");

  const deviceName = useMemo(
    () => (encodedDeviceName ? decodeURIComponent(encodedDeviceName) : ""),
    [encodedDeviceName],
  );

  const resolvedLocationId =
    locationIdParam?.trim() || currentLocation?._id || "";

  useEffect(() => {
    if (!encodedDeviceName) return;
    const pathSeg = encodedDeviceName;
    if (legacyDate && isValidYmd(legacyDate) && !startParam) {
      navigate(
        `/dashboard/kitchen-performance/${pathSeg}?startDate=${legacyDate}&endDate=${legacyDate}`,
        { replace: true },
      );
      return;
    }
    if (!isValidYmd(startParam) || !isValidYmd(endParam) || startParam! > endParam!) {
      const t = zonedWallTodayYmd(timezone);
      navigate(`/dashboard/kitchen-performance/${pathSeg}?startDate=${t}&endDate=${t}`, {
        replace: true,
      });
    }
  }, [encodedDeviceName, endParam, legacyDate, navigate, startParam, timezone]);

  const startDate = isValidYmd(startParam) ? startParam! : zonedWallTodayYmd(timezone);
  const endDate = isValidYmd(endParam) ? endParam! : startDate;
  const listBackUrl = buildKitchenPerformanceListUrl(startDate, endDate);

  const hasRequiredRouteParams =
    Boolean(deviceName) && isValidYmd(startDate) && isValidYmd(endDate);
  const canFetchDetails = hasRequiredRouteParams && Boolean(resolvedLocationId);

  const details: KitchenPerformanceDetailsData | null = useMemo(() => {
    if (!resolvedLocationId || !deviceName) return null;
    return getDetails(resolvedLocationId, deviceName);
  }, [deviceName, getDetails, resolvedLocationId]);

  useEffect(() => {
    if (!canFetchDetails) return;
    if (details != null) return;
    void fetchDetails(resolvedLocationId, deviceName, { startDate, endDate }).catch(() => {
      /* surfaced via detailsError */
    });
  }, [
    canFetchDetails,
    details,
    deviceName,
    endDate,
    fetchDetails,
    resolvedLocationId,
    startDate,
  ]);

  const waitingForLocation = hasRequiredRouteParams && !resolvedLocationId;
  const detailsPending =
    canFetchDetails && details == null && (detailsLoading || waitingForLocation);
  const detailsLoadFailed =
    canFetchDetails && details == null && !detailsLoading && detailsError != null;
  const loading = detailsPending;

  const selectedDateLabel = useMemo(
    () =>
      startDate === endDate
        ? formatYmdShort(startDate, displayTimezone)
        : `${formatYmdShort(startDate, displayTimezone)} – ${formatYmdShort(endDate, displayTimezone)}`,
    [startDate, endDate, displayTimezone],
  );

  const allTicketRows: KitchenPerformanceTicketRow[] = details?.ticketRows ?? [];

  const ticketTabView = useMemo(() => {
    const range = { start: completedAtStart, end: completedAtEnd };
    if (!hasActiveCompletedAtFilter(range)) {
      return {
        ticketRows: allTicketRows,
        kpis: details?.kpis ?? null,
        hourly: details?.hourlyCompletedTickets ?? [],
        filterActive: false,
      };
    }
    const filtered = allTicketRows.filter((row) =>
      isTicketCompletedInRange(row, range, displayTimezone),
    );
    return {
      ticketRows: filtered,
      kpis: computeKitchenPerformanceTicketTabKpisFromRows(filtered),
      hourly: computeKitchenPerformanceHourlyFromTicketRows(filtered, displayTimezone),
      filterActive: true,
    };
  }, [allTicketRows, details, completedAtStart, completedAtEnd, displayTimezone]);

  const chartXAxis = ticketTabView.hourly.map((x) => x.label);
  const chartSeriesData = ticketTabView.hourly.map((x) => x.completedTickets);

  const itemModalTickets = useMemo(() => {
    if (!itemTicketsModal) return [];
    return allTicketRows.filter((t) => ticketRowIncludesItemName(t, itemTicketsModal.itemName));
  }, [itemTicketsModal, allTicketRows]);

  const showTicketPerformance = activeTab === "ticket-performance";
  const completedTicketsForLate = ticketTabView.kpis?.completedTickets ?? 0;
  const ticketsPastDue = ticketTabView.kpis?.ticketsPastDueTime ?? 0;
  const ticketsLatePercentageDisplay =
    ticketTabView.kpis?.ticketsLatePercent != null
      ? new Intl.NumberFormat("en-US", {
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        }).format(ticketTabView.kpis.ticketsLatePercent)
      : completedTicketsForLate > 0
        ? new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 2,
            minimumFractionDigits: 0,
          }).format((ticketsPastDue / completedTicketsForLate) * 100)
        : "0";

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <OperationsIcon className="h-4 w-4 text-primary md:h-5 md:w-5 2xl:h-6 2xl:w-6" />
            <h2 className="text-base md:text-lg 2xl:text-xl font-semibold text-primary">
              Kitchen Performance Details
            </h2>
          </div>
          <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-primary">
            {selectedDateLabel}
          </span>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Link
            to={listBackUrl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-primary text-sm font-medium hover:bg-gray-50 transition-colors no-underline"
          >
            ← Back
          </Link>
          <span className="text-sm text-secondary">
            Device: <span className="font-semibold text-primary">{deviceName || "—"}</span>
          </span>
        </div>

        {canFullPage ? (
          !hasRequiredRouteParams ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-secondary">
              <p className="mb-4">Invalid or incomplete kitchen performance details link.</p>
              <Link
                to={listBackUrl}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity no-underline"
              >
                Go to Kitchen Performance
              </Link>
            </div>
          ) : detailsLoadFailed ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-secondary">
              <p className="mb-4 text-red-600">
                {detailsError ?? "Failed to load kitchen performance details."}
              </p>
              <button
                type="button"
                onClick={() =>
                  void fetchDetails(resolvedLocationId, deviceName, {
                    startDate,
                    endDate,
                  })
                }
                className="inline-flex items-center px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Retry
              </button>
            </div>
          ) : detailsPending || details == null ? (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="min-h-[280px] flex flex-col items-center justify-center gap-3 text-primary p-6">
                <Spinner size="xl" className="text-button-primary" />
                <span className="text-sm">Loading kitchen performance...</span>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("ticket-performance")}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      activeTab === "ticket-performance"
                        ? "bg-button-secondary text-primary"
                        : "text-secondary hover:bg-gray-50"
                    }`}
                  >
                    Ticket Performance
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("item-performance")}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      activeTab === "item-performance"
                        ? "bg-button-secondary text-primary"
                        : "text-secondary hover:bg-gray-50"
                    }`}
                  >
                    Item Performance
                  </button>
                </div>
                {showTicketPerformance ? (
                  <KitchenPerformanceCompletedAtFilter
                    appliedStart={completedAtStart}
                    appliedEnd={completedAtEnd}
                    onApply={(start, end) => {
                      setCompletedAtStart(start);
                      setCompletedAtEnd(end);
                    }}
                    onClear={() => {
                      setCompletedAtStart("");
                      setCompletedAtEnd("");
                    }}
                  />
                ) : null}
              </div>

              {showTicketPerformance ? (
                <KitchenPerformanceDetailsTicketTab
                  loading={loading}
                  kpis={ticketTabView.kpis}
                  ticketRows={ticketTabView.ticketRows}
                  chartXAxis={chartXAxis}
                  chartSeriesData={chartSeriesData}
                  ticketsLatePercentageDisplay={ticketsLatePercentageDisplay}
                  displayTimezone={displayTimezone}
                  completedAtFilterActive={ticketTabView.filterActive}
                  onViewTicketDetail={setTicketDetailRow}
                />
              ) : (
                <KitchenPerformanceDetailsItemTab
                  loading={loading}
                  details={details}
                  onViewItemTickets={(itemName) => setItemTicketsModal({ itemName })}
                />
              )}

              <KitchenPerformanceTicketDetailModal
                isOpen={ticketDetailRow != null}
                onClose={() => setTicketDetailRow(null)}
                row={ticketDetailRow}
                displayTimezone={displayTimezone}
                locationId={resolvedLocationId}
                dateRange={{ startDate, endDate }}
              />
              <KitchenPerformanceItemTicketsModal
                isOpen={itemTicketsModal != null}
                onClose={() => setItemTicketsModal(null)}
                itemName={itemTicketsModal?.itemName ?? ""}
                tickets={itemModalTickets}
                displayTimezone={displayTimezone}
              />
            </>
          )
        ) : (
          <p className="text-sm text-secondary">
            You do not have access to view kitchen performance details.
          </p>
        )}
      </div>
    </Layout>
  );
};
