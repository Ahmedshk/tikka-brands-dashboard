import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import OperationsIcon from "@assets/icons/operations.svg?react";
import CompletedTicketsIcon from "@assets/icons/completed_tickets.svg?react";
import CompletedItemsIcon from "@assets/icons/completed_items.svg?react";
import AvgCompletionTimeIcon from "@assets/icons/avg_completion_time.svg?react";
import RecalledTicketsIcon from "@assets/icons/recalled_tickets.svg?react";
import AvgItemsPerTicketIcon from "@assets/icons/avg_items_per_ticket.svg?react";
import TicketsPastTheirDueTimeIcon from "@assets/icons/tickets_past_their_due_time.svg?react";
import { Layout } from "../../components/common/Layout";
import { Spinner } from "../../components/common/Spinner";
import { KPICard } from "../../components/common/KPICard";
import { TimeSeriesLineChart } from "../../components/charts/TimeSeriesLineChart";
import {
  formatDateToIso,
  kitchenPerformanceService,
} from "../../services/kitchenPerformance.service";
import type { RootState } from "../../store/store";
import type {
  KitchenPerformanceDetails as KitchenPerformanceDetailsData,
  KitchenPerformanceTicketRow,
} from "../../types/kitchenPerformance.types";

type DetailsTab = "ticket-performance" | "item-performance";

const cardClass =
  "bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden";

function parseIsoDate(iso: string | null): Date | null {
  if (!iso) return null;
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTimeParts(value: string | null): { time: string; date: string } {
  if (!value) return { time: "—", date: "—" };
  const parsed = new Date(value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return { time: "—", date: "—" };
  const time = parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const date = parsed.toLocaleDateString("en-US");
  return { time, date };
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${sec}s`;
  return `${sec}s`;
}

function TicketDateCell({ value }: Readonly<{ value: string | null }>) {
  const parts = formatDateTimeParts(value);
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-primary">{parts.time}</span>
      <span className="text-secondary text-[11px]">{parts.date}</span>
    </div>
  );
}

function TicketValueCell({
  ticketName,
  orderSource,
}: Readonly<{ ticketName: string | null; orderSource: string | null }>) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-primary font-semibold">{ticketName ?? "—"}</span>
      <span className="text-secondary text-[11px]">{orderSource ?? "—"}</span>
    </div>
  );
}

const KPI_ICON_CLASS = "w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9";

export const KitchenPerformanceDetails = () => {
  const navigate = useNavigate();
  const { deviceName: encodedDeviceName } = useParams<{ deviceName: string }>();
  const [searchParams] = useSearchParams();
  const currentLocation = useSelector(
    (state: RootState) => state.location.currentLocation,
  );
  const [activeTab, setActiveTab] = useState<DetailsTab>("ticket-performance");
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<KitchenPerformanceDetailsData | null>(null);
  const initialLocationIdRef = useRef<string | null>(null);

  const selectedDate = useMemo(
    () => parseIsoDate(searchParams.get("date")) ?? new Date(),
    [searchParams],
  );
  const selectedDateLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [selectedDate],
  );
  const deviceName = useMemo(
    () => (encodedDeviceName ? decodeURIComponent(encodedDeviceName) : ""),
    [encodedDeviceName],
  );

  const fetchDetails = useCallback(async () => {
    if (!currentLocation?._id || !deviceName) {
      setDetails(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await kitchenPerformanceService.getDetails(
        currentLocation._id,
        selectedDate,
        deviceName,
      );
      setDetails(data);
    } catch {
      setDetails(null);
      toast.error("Failed to load kitchen performance details.");
    } finally {
      setLoading(false);
    }
  }, [currentLocation?._id, deviceName, selectedDate]);

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
  const showTicketPerformance = activeTab === "ticket-performance";
  const ticketsLatePercentage =
    (details?.kpis.completedTickets ?? 0) > 0
      ? Math.round(
          (((details?.kpis.ticketsPastDueTime ?? 0) /
            (details?.kpis.completedTickets ?? 1)) *
            100),
        )
      : 0;
  let content: ReactNode;

  if (showTicketPerformance) {
    content = (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <KPICard
            title="Completed Tickets"
            value={String(details?.kpis.completedTickets ?? 0)}
            accentColor="green"
            rightIcon={<CompletedTicketsIcon className={KPI_ICON_CLASS} />}
            loading={loading}
          />
          <KPICard
            title="Completed Items"
            value={String(details?.kpis.completedItems ?? 0)}
            accentColor="blue"
            rightIcon={<CompletedItemsIcon className={KPI_ICON_CLASS} />}
            loading={loading}
          />
          <KPICard
            title="Avg. Completion Time"
            value={formatDuration(details?.kpis.avgCompletionTimeSeconds ?? null)}
            accentColor="gold"
            rightIcon={<AvgCompletionTimeIcon className={KPI_ICON_CLASS} />}
            loading={loading}
          />
          <KPICard
            title="Recalled Tickets"
            value={String(details?.kpis.recalledTickets ?? 0)}
            accentColor="purple"
            rightIcon={<RecalledTicketsIcon className={KPI_ICON_CLASS} />}
            loading={loading}
          />
          <KPICard
            title="Avg. Items per Ticket"
            value={String(details?.kpis.avgItemsPerTicket ?? 0)}
            accentColor="gray"
            rightIcon={<AvgItemsPerTicketIcon className={KPI_ICON_CLASS} />}
            loading={loading}
          />
          <KPICard
            title="Tickets Past Their Due Time"
            value={`${ticketsLatePercentage}% Late`}
            accentColor="red"
            rightIcon={<TicketsPastTheirDueTimeIcon className={KPI_ICON_CLASS} />}
            loading={loading}
          />
        </div>

        <div className={cardClass}>
          <div className="p-5 pb-4 flex items-center justify-center flex-wrap gap-2 min-[500px]:justify-start">
            <h3 className="text-sm font-semibold text-secondary">
              Tickets Completed Per Hour
            </h3>
          </div>
          <div className="px-5 pb-2 flex items-center justify-center min-[500px]:justify-start">
            <span className="flex items-center gap-2 text-xs text-primary">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: "#FDB90E" }}
                aria-hidden
              />
              <span>Completed Tickets</span>
            </span>
          </div>
          {loading ? (
            <div className="min-h-[280px] h-72 md:h-64 px-5 pb-5 flex items-center justify-center">
              <Spinner size="xl" className="text-button-primary" />
            </div>
          ) : (
            <div className="scrollbar-touch min-h-[280px] h-72 md:h-64 -mx-3 px-3 pb-6 md:mx-0 md:px-5 md:pb-8 relative overflow-x-auto md:overflow-visible overflow-y-hidden">
              <div className="min-w-[560px] md:min-w-0 w-full [&_svg]:mb-6">
                <TimeSeriesLineChart
                  xAxisData={chartXAxis}
                  series={[
                    {
                      id: "completedTickets",
                      label: "Completed Tickets",
                      data: chartSeriesData,
                      color: "#FDB90E",
                    },
                  ]}
                  height={280}
                />
              </div>
            </div>
          )}
        </div>

        <div className={`${cardClass} overflow-hidden`}>
          <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center">
            <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Ticket Performance
            </h3>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="min-h-[320px] flex items-center justify-center">
                <Spinner size="xl" className="text-button-primary" />
              </div>
            ) : (
              <>
            <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0">
              {ticketRows.length === 0 ? (
                <div className="py-8 text-center text-primary/80 text-sm">
                  No data available
                </div>
              ) : (
                ticketRows.map((row, index) => (
                  <div
                    key={`${row.ticketName ?? "ticket"}-${index}-mobile`}
                    className={`px-3 py-3 ${index % 2 === 1 ? "bg-[#F3F5F7]" : "bg-white"}`}
                  >
                    <div className="min-w-0">
                      <TicketValueCell ticketName={row.ticketName} orderSource={row.orderSource} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                      <div className="flex items-start gap-2">
                        <span className="text-secondary shrink-0">Sent to KDS at:</span>
                        <TicketDateCell value={row.timeCreated} />
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-secondary shrink-0">Time due:</span>
                        <TicketDateCell value={row.timeDue} />
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-secondary shrink-0">Completed at:</span>
                        <TicketDateCell value={row.timeCompleted} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary">Completion time:</span>
                        <span className="text-primary">
                          {formatDuration(row.completionTimeSeconds)}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-secondary shrink-0">Recalled at:</span>
                        <TicketDateCell value={row.timeRecalled} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary"># of items:</span>
                        <span className="text-primary font-semibold">{row.numberOfItems ?? "—"}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
              <thead>
                <tr className="text-left text-secondary border-b border-gray-200">
                        <th className="pb-3 pr-4 pl-2 font-semibold">Ticket</th>
                  <th className="pb-3 pr-4 font-semibold">Sent to KDS at</th>
                  <th className="pb-3 pr-4 font-semibold">Time due</th>
                  <th className="pb-3 pr-4 font-semibold">Completed at</th>
                  <th className="pb-3 pr-4 font-semibold">Completion time</th>
                  <th className="pb-3 pr-4 font-semibold">Recalled at</th>
                  <th className="pb-3 pr-2 font-semibold text-right"># of items</th>
                </tr>
              </thead>
              <tbody className="text-primary">
                {ticketRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-primary/80 text-sm">
                      No data available
                    </td>
                  </tr>
                ) : (
                  ticketRows.map((row, index) => (
                    <tr
                      key={`${row.ticketName ?? "ticket"}-${index}`}
                      className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}
                    >
                            <td className="py-3 pr-4 pl-2">
                        <TicketValueCell
                          ticketName={row.ticketName}
                          orderSource={row.orderSource}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <TicketDateCell value={row.timeCreated} />
                      </td>
                      <td className="py-3 pr-4">
                        <TicketDateCell value={row.timeDue} />
                      </td>
                      <td className="py-3 pr-4">
                        <TicketDateCell value={row.timeCompleted} />
                      </td>
                      <td className="py-3 pr-4">
                        {formatDuration(row.completionTimeSeconds)}
                      </td>
                      <td className="py-3 pr-4">
                        <TicketDateCell value={row.timeRecalled} />
                      </td>
                      <td className="py-3 pr-2 text-right font-semibold">
                        {row.numberOfItems ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    content = (
      <div className={`${cardClass} overflow-hidden`}>
        <div className="rounded-t-xl bg-primary px-5 py-1 md:py-2 flex items-center">
          <h3 className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
            Item Performance
          </h3>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="min-h-[320px] flex items-center justify-center">
              <Spinner size="xl" className="text-button-primary" />
            </div>
          ) : (
            <>
          <div className="md:hidden divide-y divide-gray-200 overflow-y-auto min-h-0">
            {(details?.itemPerformanceRows.length ?? 0) === 0 ? (
              <div className="py-8 text-center text-primary/80 text-sm">
                No data available
              </div>
            ) : (
              details?.itemPerformanceRows.map((row, index) => (
                <div
                  key={`${row.itemName}-${index}-mobile`}
                  className={`px-3 py-3 ${index % 2 === 1 ? "bg-[#F3F5F7]" : "bg-white"}`}
                >
                  <p className="text-sm font-semibold text-primary truncate">{row.itemName}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-secondary">Avg. Completion Time:</span>
                      <span className="text-primary">
                        {formatDuration(row.avgCompletionTimeSeconds)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-secondary">Min. Completion Time:</span>
                      <span className="text-primary">
                        {formatDuration(row.minCompletionTimeSeconds)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-secondary">Max. Completion Time:</span>
                      <span className="text-primary">
                        {formatDuration(row.maxCompletionTimeSeconds)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-secondary">Total Quantity:</span>
                      <span className="text-primary font-semibold">{row.totalQuantity}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-[10px] md:text-xs 2xl:text-sm">
            <thead>
              <tr className="text-left text-secondary border-b border-gray-200">
                      <th className="pb-3 pr-4 pl-2 font-semibold">Item Name</th>
                      <th className="pb-3 pr-4 font-semibold">Avg. Completion Time</th>
                      <th className="pb-3 pr-4 font-semibold">Min. Completion Time</th>
                      <th className="pb-3 pr-4 font-semibold">Max. Completion Time</th>
                <th className="pb-3 pr-2 font-semibold text-right">Total Quantity</th>
              </tr>
            </thead>
            <tbody className="text-primary">
              {(details?.itemPerformanceRows.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-primary/80 text-sm">
                    No data available
                  </td>
                </tr>
              ) : (
                details?.itemPerformanceRows.map((row, index) => (
                  <tr
                    key={`${row.itemName}-${index}`}
                    className={index % 2 === 1 ? "bg-[#F3F5F7]" : ""}
                  >
                          <td className="py-3 pr-4 pl-2 font-semibold">{row.itemName}</td>
                          <td className="py-3 pr-4">
                      {formatDuration(row.avgCompletionTimeSeconds)}
                    </td>
                          <td className="py-3 pr-4">
                      {formatDuration(row.minCompletionTimeSeconds)}
                    </td>
                          <td className="py-3 pr-4">
                      {formatDuration(row.maxCompletionTimeSeconds)}
                    </td>
                    <td className="py-3 pr-2 text-right font-semibold">
                      {row.totalQuantity}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            </table>
          </div>
            </>
          )}
        </div>
      </div>
    );
  }

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
                `/dashboard/kitchen-performance?date=${formatDateToIso(selectedDate)}`,
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

        {content}
      </div>
    </Layout>
  );
};
