import { z } from "zod";
import { withLocationQuery } from "./locationQuery.validators.js";

export const listCalendarEventsQuerySchema = z.object({
  query: withLocationQuery({
    timeMin: z.coerce.date().optional(),
    timeMax: z.coerce.date().optional(),
  }),
});

export const createCalendarEventBodySchema = z.object({
  body: z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(10000).optional(),
    start: z.coerce.date(),
    end: z.coerce.date(),
    eventTypeId: z.string().min(1),
    locationId: z.string().min(1),
    googleCalendarId: z.string().min(1).max(1024),
  }),
});

export const updateCalendarEventBodySchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10000).optional(),
    start: z.coerce.date().optional(),
    end: z.coerce.date().optional(),
    eventTypeId: z.string().min(1).optional(),
  }),
});

export const syncCalendarBodySchema = z.object({
  body: z.object({
    timeMin: z.coerce.date(),
    timeMax: z.coerce.date(),
  }),
});

export const createIntegratedGoogleCalendarBodySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    googleCalendarId: z.string().min(1).max(1024),
    description: z.string().max(500).optional(),
  }),
});

export const updateIntegratedGoogleCalendarSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(500).optional(),
  }),
});

export const deleteIntegratedGoogleCalendarParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

const reminderPolicySchema = z.object({
  mode: z.enum(["daily_until", "single"]),
  daysBeforeStart: z.number().int().min(0).max(365),
  reminderTimeLocal: z.string().regex(/^\d{1,2}:\d{2}$/),
});

export const createEventTypeBodySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    colorHex: z.string().max(32).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    reminderPolicy: reminderPolicySchema.optional(),
  }),
});

export const updateEventTypeBodySchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    colorHex: z.string().max(32).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    reminderPolicy: reminderPolicySchema.partial().optional(),
  }),
});

const channelPrefsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
});

const roleBindingSchema = z.object({
  eventTypeId: z.string().min(1),
  roleId: z.string().min(1),
  channels: channelPrefsSchema,
  notifyOnStart: z.boolean(),
  notifyReminders: z.boolean(),
});

export const updateNotificationSettingsBodySchema = z.object({
  body: z.object({
    reminderPolicy: reminderPolicySchema.optional(),
    roleEventBindings: z.array(roleBindingSchema).optional(),
  }),
});
