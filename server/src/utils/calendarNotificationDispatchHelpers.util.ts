/** Location line for calendar notification email templates (store · address or em dash). */
export function formatCalendarLocationLine(
  locationDoc: { storeName?: string; address?: string } | null | undefined,
): string {
  if (!locationDoc) {
    return "—";
  }
  const parts = [locationDoc.storeName, locationDoc.address].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

export function computeMinutesUntilEventStart(eventStart: Date, now: Date): number {
  return Math.max(1, Math.round((eventStart.getTime() - now.getTime()) / 60_000));
}

/** Titles/messages for the ~1h calendar notification (matches prior dispatch copy). */
export function buildHourBeforeNotificationCopy(params: {
  evTitle: string;
  tz: string | undefined;
  minsUntil: number;
  startShort: string;
}): {
  title: string;
  message: string;
  urgencyLine: string;
  countdownLine: string;
} {
  const aboutOneHour = params.minsUntil >= 55 && params.minsUntil <= 65;
  const tz = params.tz;
  const title =
    aboutOneHour ? "Calendar event in about 1 hour" : "Upcoming calendar event";
  let message: string;
  let urgencyLine: string;
  if (aboutOneHour) {
    message = `${params.evTitle} starts in about 1 hour (${tz}).`;
    urgencyLine = "This event starts in about 1 hour.";
  } else {
    const plural = params.minsUntil === 1 ? "" : "s";
    message = `${params.evTitle} starts in ${params.minsUntil} minute${plural} (${tz}).`;
    urgencyLine = `This event starts in ${params.minsUntil} minute${plural}.`;
  }
  return {
    title,
    message,
    urgencyLine,
    countdownLine: `${params.evTitle} · ${params.startShort}`,
  };
}
