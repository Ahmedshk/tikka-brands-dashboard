import { z } from "zod";
import { withLocationQuery } from "./locationQuery.validators.js";

const ymdDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-MM-dd");

export const getActivityLogQuerySchema = z.object({
  query: withLocationQuery({
    date: ymdDateSchema,
  }),
});

export const getActivityLogOrderNoteQuerySchema = z.object({
  params: z.object({
    squareOrderId: z.string().min(1, "Square order ID is required"),
  }),
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
  }),
});

export const putActivityLogOrderNoteSchema = z.object({
  params: z.object({
    squareOrderId: z.string().min(1, "Square order ID is required"),
  }),
  body: z.object({
    locationId: z.string().min(1, "Location ID is required"),
    note: z.string().max(2000, "Note must be at most 2000 characters"),
  }),
});
