import { z } from "zod";

const ymdDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-MM-dd");

export const getActivityLogQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    date: ymdDateSchema,
  }),
});
