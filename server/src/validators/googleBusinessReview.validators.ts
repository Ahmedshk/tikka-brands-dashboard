import { z } from "zod";
import { withLocationQuery } from "./locationQuery.validators.js";

const periodEnum = z.enum(["today", "weekToDate", "month", "custom", "all"]);

export const listGoogleBusinessReviewsQuerySchema = z.object({
  query: withLocationQuery({
    period: periodEnum.default("all"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    minRating: z.coerce.number().int().min(1).max(5).optional(),
    maxRating: z.coerce.number().int().min(1).max(5).optional(),
  }),
});
