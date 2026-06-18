import CompletedTicketsIcon from "@assets/icons/completed_tickets.svg?react";
import CompletedItemsIcon from "@assets/icons/completed_items.svg?react";
import AvgCompletionTimeIcon from "@assets/icons/avg_completion_time.svg?react";
import RecalledTicketsIcon from "@assets/icons/recalled_tickets.svg?react";
import AvgItemsPerTicketIcon from "@assets/icons/avg_items_per_ticket.svg?react";
import TicketsPastTheirDueTimeIcon from "@assets/icons/tickets_past_their_due_time.svg?react";
import ViewIcon from "@assets/icons/view.svg?react";
import { KPICard } from "../common/KPICard";
import { Spinner } from "../common/Spinner";
import { TimeSeriesLineChart } from "../charts/TimeSeriesLineChart";
import type {
  KitchenPerformanceTicketKpis,
  KitchenPerformanceTicketRow,
} from "../../types/kitchenPerformance.types";
import { formatKitchenPerformanceAvgItemsPerTicket } from "../../utils/kitchenPerformanceKpiDisplay.util";
import {
  formatDuration,
  formatTicketCompletionDuration,
  formatTicketItemCount,
  getTicketTimeDueForDisplay,
  TicketDateCell,
  TicketValueCell,
} from "./kitchenPerformanceTicketUi";

const KPI_ICON_CLASS = "w-7 h-7 md:w-8 md:h-8 2xl:w-9 2xl:h-9";
const cardClass =
  "bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden";

type Props = {
  loading: boolean;
  kpis: KitchenPerformanceTicketKpis | null;
  ticketRows: KitchenPerformanceTicketRow[];
  chartXAxis: string[];
  chartSeriesData: number[];
  ticketsLatePercentageDisplay: string;
  displayTimezone: string;
  completedAtFilterActive: boolean;
  onViewTicketDetail: (row: KitchenPerformanceTicketRow) => void;
};

export const KitchenPerformanceDetailsTicketTab = ({
  loading,
  kpis,
  ticketRows,
  chartXAxis,
  chartSeriesData,
  ticketsLatePercentageDisplay,
  displayTimezone,
  completedAtFilterActive,
  onViewTicketDetail,
}: Props) => {
  const emptyTableMessage = completedAtFilterActive
    ? "No tickets match this completed at range."
    : "No data available";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KPICard
          title="Completed Tickets"
          value={String(kpis?.completedTickets ?? 0)}
          accentColor="green"
          rightIcon={<CompletedTicketsIcon className={KPI_ICON_CLASS} />}
          loading={loading}
        />
        <KPICard
          title="Completed Items"
          value={String(kpis?.completedItems ?? 0)}
          accentColor="blue"
          rightIcon={<CompletedItemsIcon className={KPI_ICON_CLASS} />}
          loading={loading}
        />
        <KPICard
          title="Avg. Completion Time"
          value={formatDuration(kpis?.avgCompletionTimeSeconds ?? null)}
          accentColor="gold"
          rightIcon={<AvgCompletionTimeIcon className={KPI_ICON_CLASS} />}
          loading={loading}
        />
        <KPICard
          title="Recalled Tickets"
          value={String(kpis?.recalledTickets ?? 0)}
          accentColor="purple"
          rightIcon={<RecalledTicketsIcon className={KPI_ICON_CLASS} />}
          loading={loading}
        />
        <KPICard
          title="Avg. Items per Ticket"
          value={formatKitchenPerformanceAvgItemsPerTicket(kpis?.avgItemsPerTicket)}
          accentColor="gray"
          rightIcon={<AvgItemsPerTicketIcon className={KPI_ICON_CLASS} />}
          loading={loading}
        />
        <KPICard
          title="Tickets Past Their Due Time"
          value={`${ticketsLatePercentageDisplay}% Late`}
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
                    {emptyTableMessage}
                  </div>
                ) : (
                  ticketRows.map((row, index) => (
                    <div
                      key={`${row.ticketName ?? "ticket"}-${index}-mobile`}
                      className={`px-3 py-3 ${index % 2 === 1 ? "bg-[#F3F5F7]" : "bg-white"}`}
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <TicketValueCell
                            ticketName={row.ticketName}
                            orderSource={row.orderSource}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => onViewTicketDetail(row)}
                          className="shrink-0 p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center"
                          aria-label="View ticket details"
                          title="View ticket details"
                        >
                          <ViewIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                        <div className="flex items-start gap-2">
                          <span className="text-secondary shrink-0">
                            Sent to KDS at:
                          </span>
                          <TicketDateCell
                            value={row.timeCreated}
                            displayTimezone={displayTimezone}
                            layout="inline"
                          />
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-secondary shrink-0">Time due:</span>
                          <TicketDateCell
                            value={getTicketTimeDueForDisplay(row)}
                            displayTimezone={displayTimezone}
                            layout="inline"
                          />
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-secondary shrink-0">
                            Completed at:
                          </span>
                          <TicketDateCell
                            value={row.timeCompleted}
                            displayTimezone={displayTimezone}
                            compareDueForCompletedAt={getTicketTimeDueForDisplay(row)}
                            highlightLate={
                              getTicketTimeDueForDisplay(row)
                                ? row.isLate ?? undefined
                                : false
                            }
                            layout="inline"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-secondary">Completion time:</span>
                          <span className="text-primary">
                            {formatTicketCompletionDuration(row)}
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-secondary shrink-0">Recalled at:</span>
                          <TicketDateCell
                            value={row.timeRecalled}
                            displayTimezone={displayTimezone}
                            layout="inline"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-secondary"># of items:</span>
                          <span className="text-primary font-semibold">
                            {formatTicketItemCount(row.numberOfItems)}
                          </span>
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
                      <th className="pb-3 pr-4 font-semibold text-right">
                        # of items
                      </th>
                      <th className="pb-3 pr-2 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-primary">
                    {ticketRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-8 text-center text-primary/80 text-sm"
                        >
                          {emptyTableMessage}
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
                            <TicketDateCell
                              value={row.timeCreated}
                              displayTimezone={displayTimezone}
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <TicketDateCell
                              value={getTicketTimeDueForDisplay(row)}
                              displayTimezone={displayTimezone}
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <TicketDateCell
                              value={row.timeCompleted}
                              displayTimezone={displayTimezone}
                              compareDueForCompletedAt={getTicketTimeDueForDisplay(row)}
                            highlightLate={
                              getTicketTimeDueForDisplay(row)
                                ? row.isLate ?? undefined
                                : false
                            }
                            />
                          </td>
                          <td className="py-3 pr-4">
                            {formatTicketCompletionDuration(row)}
                          </td>
                          <td className="py-3 pr-4">
                            <TicketDateCell
                              value={row.timeRecalled}
                              displayTimezone={displayTimezone}
                            />
                          </td>
                          <td className="py-3 pr-4 text-right font-semibold">
                            {formatTicketItemCount(row.numberOfItems)}
                          </td>
                          <td className="py-3 pr-2 text-center">
                            <button
                              type="button"
                              onClick={() => onViewTicketDetail(row)}
                              className="p-1.5 text-primary hover:bg-gray-200 rounded transition-colors inline-flex items-center justify-center"
                              aria-label="View ticket details"
                              title="View ticket details"
                            >
                              <ViewIcon className="w-4 h-4" />
                            </button>
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
};

