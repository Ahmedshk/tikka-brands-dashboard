import { formatDateTimeParts } from "../../utils/dateTimeDisplayHelpers";
import { getTicketCompletionTimeForDisplay } from "../../utils/kitchenPerformanceDuration.util";
import {
  getTicketTimeDueForDisplay,
  isCompletedAfterDue,
  isTicketCompletedLate,
} from "../../utils/kitchenPerformanceTicketLate.util";

export { getTicketTimeDueForDisplay, isCompletedAfterDue, isTicketCompletedLate };

export function formatTicketItemCount(count: number | null): string {
  if (count == null || !Number.isFinite(count)) return "—";
  const n = Math.floor(count);
  if (n === 1) return "1 item";
  return `${n} items`;
}

export function formatTicketCompletionDuration(row: {
  completionTimeSeconds: number | null;
  timeCreated: string | null;
  timeCompleted: string | null;
}): string {
  return formatDuration(getTicketCompletionTimeForDisplay(row));
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (hrs > 0) return `${hrs} hr ${mins} min ${String(sec).padStart(2, "0")} sec`;
  if (mins > 0) return `${mins} min ${String(sec).padStart(2, "0")} sec`;
  return `${sec} sec`;
}

export function TicketDateCell({
  value,
  displayTimezone,
  compareDueForCompletedAt,
  highlightLate,
  layout = "stacked",
}: Readonly<{
  value: string | null;
  displayTimezone: string;
  /** When set, `value` is treated as completed-at; time is shown in red if after this due time. */
  compareDueForCompletedAt?: string | null;
  highlightLate?: boolean;
  /** Mobile ticket rows: time and date on one line. */
  layout?: "stacked" | "inline";
}>) {
  const parts = formatDateTimeParts(value, displayTimezone);
  const showLateCompletion =
    highlightLate === true ||
    (highlightLate !== false &&
      compareDueForCompletedAt !== undefined &&
      isCompletedAfterDue(value, compareDueForCompletedAt ?? null));
  const timeClass = showLateCompletion ? "text-red-600 font-semibold" : "text-primary";

  if (parts.time === "—" && parts.date === "—") {
    return (
      <div className="leading-tight">
        <span className="text-primary">—</span>
      </div>
    );
  }

  if (layout === "inline") {
    return (
      <div className="flex flex-row flex-wrap items-baseline gap-x-1.5 min-w-0 leading-tight">
        <span className={timeClass}>{parts.time}</span>
        <span className="text-secondary text-[11px]">{parts.date}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col leading-tight">
      <span className={timeClass}>{parts.time}</span>
      <span className="text-secondary text-[11px]">{parts.date}</span>
    </div>
  );
}

export function TicketValueCell({
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
