import { readFileSync } from "node:fs";
import { google, type calendar_v3 } from "googleapis";
import { JWT } from "google-auth-library";
import { AppError } from "../utils/errors.util.js";
import { logger } from "../utils/logger.util.js";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

const PRIVATE_SOURCE = "tikka-dashboard";

/** Normalize value from .env: trim, strip one outer pair of quotes (dotenv / copy-paste). */
function normalizeInlineServiceAccountJson(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

function loadServiceAccountCredentials(): { client_email: string; private_key: string } {
  const jsonInline = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonInline) {
    const payload = normalizeInlineServiceAccountJson(jsonInline);
    try {
      const parsed = JSON.parse(payload) as { client_email?: string; private_key?: string };
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error("JSON must include client_email and private_key");
      }
      return { client_email: parsed.client_email, private_key: parsed.private_key };
    } catch (e) {
      const hint =
        "Use one line of minified JSON, or wrap the entire value in single quotes in .env. " +
        "Do not paste pretty-printed JSON across multiple lines (dotenv will truncate). " +
        "Alternatively set GOOGLE_APPLICATION_CREDENTIALS to the path of the downloaded .json file.";
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("Failed to parse GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", { msg });
      throw new AppError(`Invalid GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: ${msg}. ${hint}`, 500);
    }
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (path) {
    try {
      const raw = readFileSync(path, "utf-8");
      const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error("Invalid credentials file");
      }
      return { client_email: parsed.client_email, private_key: parsed.private_key };
    } catch (e) {
      logger.error("Failed to read GOOGLE_APPLICATION_CREDENTIALS", { path, e });
      throw new AppError("Could not load Google service account credentials", 500);
    }
  }
  throw new AppError(
    "Google Calendar is not configured. Set GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.",
    503,
  );
}

function getJwtClient(): JWT {
  const { client_email, private_key } = loadServiceAccountCredentials();
  const subject = process.env.GOOGLE_CALENDAR_IMPERSONATED_USER?.trim();
  const opts: {
    email: string;
    key: string;
    scopes: string[];
    subject?: string;
  } = {
    email: client_email,
    key: private_key,
    scopes: [CALENDAR_SCOPE],
  };
  if (subject) opts.subject = subject;
  return new JWT(opts);
}

function getCalendarApi(): calendar_v3.Calendar {
  const auth = getJwtClient();
  return google.calendar({ version: "v3", auth });
}

/** Service account (or credentials file) is present and loadable. */
export function hasGoogleCalendarCredentials(): boolean {
  try {
    if (process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON?.trim()) return true;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * @deprecated Prefer hasGoogleCalendarCredentials(); calendar targets now live in DB.
 * True when credentials exist (no longer requires GOOGLE_CALENDAR_ID).
 */
export function isGoogleCalendarConfigured(): boolean {
  return hasGoogleCalendarCredentials();
}

/** Returns configured service account email (safe to display), if available. */
export function getGoogleCalendarServiceAccountEmail(): string | null {
  try {
    const { client_email } = loadServiceAccountCredentials();
    return client_email?.trim() ? client_email.trim() : null;
  } catch {
    return null;
  }
}

export interface GoogleCalendarInsertInput {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  timeZone: string;
  locationId: string;
  eventTypeId: string;
}

export async function insertGoogleEvent(
  calendarId: string,
  input: GoogleCalendarInsertInput,
): Promise<string> {
  const calendar = getCalendarApi();
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.title,
      description: input.description ?? "",
      start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
      end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
      extendedProperties: {
        private: {
          locationId: input.locationId,
          eventTypeId: input.eventTypeId,
          source: PRIVATE_SOURCE,
        },
      },
    },
  });
  const id = res.data.id;
  if (!id) throw new AppError("Google Calendar did not return an event id", 502);
  return id;
}

export async function patchGoogleEvent(
  calendarId: string,
  googleEventId: string,
  input: Partial<GoogleCalendarInsertInput>,
): Promise<void> {
  const calendar = getCalendarApi();
  const body: calendar_v3.Schema$Event = {};
  if (input.title != null) body.summary = input.title;
  if (input.description != null) body.description = input.description;
  if (input.start != null && input.timeZone != null) {
    body.start = { dateTime: input.start.toISOString(), timeZone: input.timeZone };
  }
  if (input.end != null && input.timeZone != null) {
    body.end = { dateTime: input.end.toISOString(), timeZone: input.timeZone };
  }
  if (input.locationId != null && input.eventTypeId != null) {
    body.extendedProperties = {
      private: {
        locationId: input.locationId,
        eventTypeId: input.eventTypeId,
        source: PRIVATE_SOURCE,
      },
    };
  }
  await calendar.events.patch({
    calendarId,
    eventId: googleEventId,
    requestBody: body,
  });
}

export async function deleteGoogleEvent(calendarId: string, googleEventId: string): Promise<void> {
  const calendar = getCalendarApi();
  try {
    await calendar.events.delete({ calendarId, eventId: googleEventId });
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    if (status === 404) return;
    throw err;
  }
}

export interface ParsedGoogleEvent {
  googleCalendarId: string;
  googleEventId: string;
  title: string;
  description: string;
  start: Date;
  end: Date;
  timeZone: string;
  locationId: string | null;
  eventTypeId: string | null;
}

function parseGoogleEventItem(
  ev: calendar_v3.Schema$Event,
  googleCalendarId: string,
): ParsedGoogleEvent | null {
  const googleEventId = ev.id;
  if (!googleEventId) return null;
  const priv = ev.extendedProperties?.private as Record<string, string> | undefined;
  if (!priv?.locationId || !priv?.eventTypeId) return null;
  const startRaw = ev.start?.dateTime ?? ev.start?.date;
  const endRaw = ev.end?.dateTime ?? ev.end?.date;
  if (!startRaw || !endRaw) return null;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  const timeZone = ev.start?.timeZone ?? ev.end?.timeZone ?? "UTC";
  const title = ev.summary ?? "(No title)";
  const description = ev.description ?? "";
  return {
    googleCalendarId,
    googleEventId,
    title,
    description,
    start,
    end,
    timeZone,
    locationId: priv?.locationId ?? null,
    eventTypeId: priv?.eventTypeId ?? null,
  };
}

export async function listGoogleEventsInRange(
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<ParsedGoogleEvent[]> {
  if (!hasGoogleCalendarCredentials()) return [];
  const calendar = getCalendarApi();
  const out: ParsedGoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const listParams: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 500,
    };
    if (pageToken) listParams.pageToken = pageToken;
    const res = await calendar.events.list(listParams);
    const items = res.data.items ?? [];
    for (const ev of items) {
      const parsed = parseGoogleEventItem(ev, calendarId);
      if (parsed?.locationId && parsed.eventTypeId) out.push(parsed);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** Throws AppError 400 if calendar is missing or not accessible with current credentials. */
export async function assertGoogleCalendarAccessible(calendarId: string): Promise<void> {
  if (!hasGoogleCalendarCredentials()) {
    throw new AppError(
      "Google Calendar is not configured. Set GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.",
      503,
    );
  }
  const trimmed = calendarId.trim();
  if (!trimmed) throw new AppError("Google Calendar id is required.", 400);
  const calendar = getCalendarApi();
  try {
    await calendar.calendars.get({ calendarId: trimmed });
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    const msg = (err as { message?: string })?.message ?? "Unknown error";
    if (status === 404) {
      throw new AppError(
        "Google Calendar was not found or the service account cannot access it. Share the calendar with the service account email or use domain-wide delegation.",
        400,
      );
    }
    logger.warn("calendars.get failed", { status, msg });
    throw new AppError(`Could not verify Google Calendar access: ${msg}`, 400);
  }
}
