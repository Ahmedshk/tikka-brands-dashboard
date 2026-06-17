import type { Request, Response } from "express";
import { listGoogleBusinessReviewsForParams } from "../services/googleBusinessReviewRead.service.js";
import { resolveTargetLocationIds } from "../utils/locationScope.js";
import type { GoogleBusinessReviewPeriod } from "../types/googleBusinessReview.types.js";

export async function listGoogleBusinessReviews(req: Request, res: Response): Promise<void> {
  const q = req.query;
  const period = (typeof q.period === "string" ? q.period : "all") as GoogleBusinessReviewPeriod;
  const startDate = typeof q.startDate === "string" ? q.startDate : undefined;
  const endDate = typeof q.endDate === "string" ? q.endDate : undefined;
  const page = typeof q.page === "string" ? Number.parseInt(q.page, 10) : 1;
  const limit = typeof q.limit === "string" ? Number.parseInt(q.limit, 10) : 20;
  const minRating =
    typeof q.minRating === "string" ? Number.parseInt(q.minRating, 10) : undefined;
  const maxRating =
    typeof q.maxRating === "string" ? Number.parseInt(q.maxRating, 10) : undefined;

  const locationIds = await resolveTargetLocationIds(req);

  const data = await listGoogleBusinessReviewsForParams({
    locationIds,
    period,
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 20,
    ...(minRating != null && Number.isFinite(minRating) ? { minRating } : {}),
    ...(maxRating != null && Number.isFinite(maxRating) ? { maxRating } : {}),
  });

  res.json(data);
}
