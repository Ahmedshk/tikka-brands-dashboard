import { z } from "zod";

const ymdDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-MM-dd");

const dateRangeQuerySchema = z
  .object({
    locationId: z.string().min(1, "Location ID is required"),
    startDate: ymdDateSchema,
    endDate: ymdDateSchema,
    page: z.string().optional(),
    limit: z.string().optional(),
  })
  .refine((q) => q.startDate <= q.endDate, {
    message: "startDate must be on or before endDate",
    path: ["endDate"],
  });

export const getKitchenPerformanceQuerySchema = z.object({
  query: dateRangeQuerySchema,
});

export const importKitchenPerformanceBodySchema = z
  .object({
    body: z.object({
      locationId: z.string().min(1, "Location ID is required"),
      startDate: ymdDateSchema,
      endDate: ymdDateSchema,
    }),
  })
  .refine((o) => o.body.startDate <= o.body.endDate, {
    message: "startDate must be on or before endDate",
    path: ["body", "endDate"],
  });

export const getKitchenPerformanceDetailsQuerySchema = z.object({
  query: z
    .object({
      locationId: z.string().min(1, "Location ID is required"),
      startDate: ymdDateSchema,
      endDate: ymdDateSchema,
      deviceName: z.string().min(1, "Device name is required"),
    })
    .refine((q) => q.startDate <= q.endDate, {
      message: "startDate must be on or before endDate",
      path: ["endDate"],
    }),
});
