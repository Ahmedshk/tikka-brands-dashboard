import type { Request, Response } from "express";
import { listGoogleBusinessReviewsForParams } from "../services/googleBusinessReviewRead.service.js";
import { LocationService } from "../services/location.service.js";
import { AppError } from "../utils/errors.util.js";
import type { GoogleBusinessReviewPeriod } from "../types/googleBusinessReview.types.js";

const locationService = new LocationService();

async function resolveLocationIds(
  locationIdParam: string,
  allowedLocationIds: string[] | "all" | undefined,
): Promise<string[]> {
  if (locationIdParam === "__all__") {
    const all = await locationService.getAll();
    let ids = all.map((l) => String(l._id));
    if (allowedLocationIds != null && allowedLocationIds !== "all" && allowedLocationIds.length > 0) {
      const allow = new Set(allowedLocationIds);
      ids = ids.filter((id) => allow.has(id));
    }
    return ids;
  }

  if (
    allowedLocationIds != null &&
    allowedLocationIds !== "all" &&
    allowedLocationIds.length > 0 &&
    !allowedLocationIds.includes(locationIdParam)
  ) {
    throw new AppError("Location not allowed", 403);
  }

  return [locationIdParam];
}

export async function listGoogleBusinessReviews(req: Request, res: Response): Promise<void> {
  const q = req.query;
  const locationId = typeof q.locationId === "string" ? q.locationId : "";
  const period = (typeof q.period === "string" ? q.period : "all") as GoogleBusinessReviewPeriod;
  const startDate = typeof q.startDate === "string" ? q.startDate : undefined;
  const endDate = typeof q.endDate === "string" ? q.endDate : undefined;
  const page = typeof q.page === "string" ? Number.parseInt(q.page, 10) : 1;
  const limit = typeof q.limit === "string" ? Number.parseInt(q.limit, 10) : 20;
  const minRating =
    typeof q.minRating === "string" ? Number.parseInt(q.minRating, 10) : undefined;
  const maxRating =
    typeof q.maxRating === "string" ? Number.parseInt(q.maxRating, 10) : undefined;

  const locationIds = await resolveLocationIds(locationId, req.user?.allowedLocationIds);

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
