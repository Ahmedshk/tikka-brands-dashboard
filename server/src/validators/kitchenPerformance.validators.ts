import { z } from "zod";

const ymdDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-MM-dd");

export const getKitchenPerformanceQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    date: ymdDateSchema,
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const importKitchenPerformanceBodySchema = z.object({
  body: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    date: ymdDateSchema,
  }),
});

export const getKitchenPerformanceDetailsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    date: ymdDateSchema,
    deviceName: z.string().min(1, "Device name is required"),
  }),
});
