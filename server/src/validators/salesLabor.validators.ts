import { z } from "zod";

export const getSalesLaborKPIsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, "Location ID is required"),
  }),
});
