import { z } from "zod";

const businessStartTimeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

const locationBodySchema = z.object({
  storeName: z.string().min(1, "Store name is required").trim(),
  address: z.string().min(1, "Address is required").trim(),
  squareLocationId: z.string().min(1, "Square location ID is required").trim(),
  homebaseLocationId: z.string().min(1, "Homebase location ID is required").trim(),
  timezone: z.string().min(1, "Timezone is required").trim(),
  businessStartTime: z
    .string()
    .trim()
    .regex(businessStartTimeRegex, "Use HH:mm 24h format"),
  squareAccessToken: z.string().min(1, "Square access token is required").trim(),
  homebaseApiKey: z.string().min(1, "Homebase API key is required").trim(),
  logoId: z.string().trim().optional().nullable(),
});

export const createLocationSchema = z.object({
  body: locationBodySchema,
});

export const updateLocationSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Location ID is required"),
  }),
  body: locationBodySchema.partial().extend({
    squareAccessToken: z.string().trim().optional(),
    homebaseApiKey: z.string().trim().optional(),
    logoId: z.string().trim().optional().nullable(),
  }),
});

export const getLocationSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Location ID is required"),
  }),
});

export const deleteLocationSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Location ID is required"),
  }),
});

export const getLocationsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
    limit: z.coerce
      .number()
      .int()
      .min(1, "Limit must be at least 1")
      .max(500, "Limit must be at most 500")
      .default(10),
  }),
});
