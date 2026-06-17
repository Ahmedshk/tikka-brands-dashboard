import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import OperationsIcon from "@assets/icons/operations.svg?react";
import { Layout } from "../../components/common/Layout";
import { kitchenPerformanceService } from "../../services/kitchenPerformance.service";
import { zonedWallTodayYmd } from "../../utils/kitchenPerformancePeriodRange";
import { selectCurrentLocation } from "../../store/locationSelectors";
import { useCanAccessComponent } from "../../hooks/useCanAccessComponent";
import { KitchenPerformanceDetailsItemTab } from "../../components/KitchenPerformance/KitchenPerformanceDetailsItemTab";
import { KitchenPerformanceDetailsTicketTab } from "../../components/KitchenPerformance/KitchenPerformanceDetailsTicketTab";
import {
  KitchenPerformanceItemTicketsModal,
  KitchenPerformanceTicketDetailModal,
} from "../../components/KitchenPerformance";
import { ticketRowIncludesItemName } from "../../utils/kitchenPerformanceItemsInTicket";
import {
  formatYmdShort,
  isValidYmd,
} from "../../utils/kitchenPerformanceDetailsDateHelpers";
import { resolveDisplayTimezone } from "../../utils/displayTimezoneHelpers";

const DETAILS_PAGE_ID = "kitchen-performance-details";
import type {
  KitchenPerformanceDetails as KitchenPerformanceDetailsData,
  KitchenPerformanceTicketRow,
} from "../../types/kitchenPerformance.types";

type DetailsTab = "ticket-performance" | "item-performance";

export const KitchenPerformanceDetails = () => {
  const navigate = useNavigate();
  const { deviceName: encodedDeviceName } = useParams<{ deviceName: string }>();
  const [searchParams] = useSearchParams();
  const currentLocation = useSelector(selectCurrentLocation);
  const canFullPage = useCanAccessComponent(DETAILS_PAGE_ID, "full-page");
  const [activeTab, setActiveTab] = useState<DetailsTab>("ticket-performance");
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<KitchenPerformanceDetailsData | null>(null);
  const [ticketDetailRow, setTicketDetailRow] = useState<KitchenPerformanceTicketRow | null>(
    null,
  );
  const [itemTicketsModal, setItemTicketsModal] = useState<{ itemName: string } | null>(null);
  const initialLocationIdRef = useRef<string | null>(null);

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

  const deviceName = useMemo(
    () => (encodedDeviceName ? decodeURIComponent(encodedDeviceName) : ""),
    [encodedDeviceName],
  );

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

  const selectedDateLabel = useMemo(
    () =>
      startDate === endDate
        ? formatYmdShort(startDate, displayTimezone)
        : `${formatYmdShort(startDate, displayTimezone)} – ${formatYmdShort(endDate, displayTimezone)}`,
    [startDate, endDate, displayTimezone],
  );

  const fetchDetails = useCallback(async () => {
    if (!currentLocation?._id || !deviceName || !canFullPage) {
      setDetails(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await kitchenPerformanceService.getDetails(
        currentLocation._id,
        { startDate, endDate },
        deviceName,
      );
      setDetails(data);
    } catch {
      setDetails(null);
      toast.error("Failed to load kitchen performance details.");
    } finally {
      setLoading(false);
    }
  }, [currentLocation?._id, deviceName, startDate, endDate, canFullPage]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  useEffect(() => {
    const locationId = currentLocation?._id ?? null;
    if (initialLocationIdRef.current == null) {
      initialLocationIdRef.current = locationId;
      return;
    }
    if (locationId && initialLocationIdRef.current !== locationId) {
      navigate("/dashboard/kitchen-performance");
    }
  }, [currentLocation?._id, navigate]);

  const chartXAxis = (details?.hourlyCompletedTickets ?? []).map((x) => x.label);
  const chartSeriesData = (details?.hourlyCompletedTickets ?? []).map(
    (x) => x.completedTickets,
  );
  const ticketRows: KitchenPerformanceTicketRow[] = details?.ticketRows ?? [];
  const itemModalTickets = useMemo(() => {
    if (!itemTicketsModal) return [];
    return ticketRows.filter((t) =>
      ticketRowIncludesItemName(t.itemsInTicket, itemTicketsModal.itemName),
    );
  }, [itemTicketsModal, ticketRows]);
  const showTicketPerformance = activeTab === "ticket-performance";
  const completedTicketsForLate = details?.kpis.completedTickets ?? 0;
  const ticketsPastDue = details?.kpis.ticketsPastDueTime ?? 0;
  const ticketsLatePercentageDisplay =
    completedTicketsForLate > 0
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
          <button
            type="button"
            onClick={() =>
              navigate(
                `/dashboard/kitchen-performance?startDate=${startDate}&endDate=${endDate}`,
              )
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-primary text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            ← Back
          </button>
          <span className="text-sm text-secondary">
            Device: <span className="font-semibold text-primary">{deviceName || "—"}</span>
          </span>
        </div>

        {canFullPage ? (
          <>
            <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1">
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
              <KitchenPerformanceDetailsTicketTab
                loading={loading}
                details={details}
                ticketRows={ticketRows}
                chartXAxis={chartXAxis}
                chartSeriesData={chartSeriesData}
                ticketsLatePercentageDisplay={ticketsLatePercentageDisplay}
                displayTimezone={displayTimezone}
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
            />
            <KitchenPerformanceItemTicketsModal
              isOpen={itemTicketsModal != null}
              onClose={() => setItemTicketsModal(null)}
              itemName={itemTicketsModal?.itemName ?? ""}
              tickets={itemModalTickets}
              displayTimezone={displayTimezone}
            />
          </>
        ) : (
          <p className="text-sm text-secondary">
            You do not have access to view kitchen performance details.
          </p>
        )}
      </div>
    </Layout>
  );
};
