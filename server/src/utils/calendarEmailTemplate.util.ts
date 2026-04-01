/** Rows for the schedule table in calendar event emails. */
export type CalendarEmailScheduleRow = { label: string; value: string };

export interface CalendarEventEmailLean {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  timeZone: string;
}

function formatLongDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function sameCalendarDay(a: Date, b: Date, timeZone: string): boolean {
  const df = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return df.format(a) === df.format(b);
}

export function buildCalendarScheduleRows(
  start: Date,
  end: Date,
  timeZone: string,
): CalendarEmailScheduleRow[] {
  if (sameCalendarDay(start, end, timeZone)) {
    return [
      { label: "Date", value: formatLongDate(start, timeZone) },
      { label: "Time", value: `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}` },
      { label: "Time zone", value: timeZone },
    ];
  }
  return [
    {
      label: "Starts",
      value: `${formatLongDate(start, timeZone)} at ${formatTime(start, timeZone)}`,
    },
    {
      label: "Ends",
      value: `${formatLongDate(end, timeZone)} at ${formatTime(end, timeZone)}`,
    },
    { label: "Time zone", value: timeZone },
  ];
}

/** Compact start line for urgency copy (e.g. "Mon, Mar 31, 7:15 AM"). */
export function formatShortEventStart(start: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(start);
}

export function buildCalendarEventDetailFields(params: {
  ev: CalendarEventEmailLean;
  eventTypeName: string;
  eventTypeColorHex: string;
  locationLine: string;
}): Record<string, unknown> {
  const description = (params.ev.description ?? "").trim();
  return {
    eventTitle: params.ev.title,
    eventTypeName: params.eventTypeName,
    eventTypeColorHex: params.eventTypeColorHex,
    locationLine: params.locationLine,
    scheduleRows: buildCalendarScheduleRows(params.ev.start, params.ev.end, params.ev.timeZone),
    hasDescription: description.length > 0,
    descriptionPlain: description,
  };
}
