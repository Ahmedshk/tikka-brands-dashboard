import type { Request, Response, NextFunction } from "express";
import {
  ActivityLogService,
  createActivityLogCaches,
} from "../services/activityLog.service.js";
import { LocationService } from "../services/location.service.js";
import { isAllLocationsId, resolveEffectiveAllowedLocationIds } from "../utils/locationScope.js";

const service = new ActivityLogService();
const locationService = new LocationService();

export async function getActivityLog(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { locationId, date } = req.query as {
      locationId: string;
      date: string;
    };

    if (isAllLocationsId(locationId)) {
      const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
      // Single cache pair shared across the per-location fan-out: each unique
      // payment id / team member id only triggers one Mongo lookup (or live
      // Square API hit) per HTTP request, even when many locations reference
      // the same regional manager or the same payment id appears across an
      // order + its refund pair.
      const caches = createActivityLogCaches();
      const perLocation = await Promise.all(
        effectiveIds.map(async (id) => {
          const [result, loc] = await Promise.all([
            service.getByLocationAndDate(id, date, caches),
            locationService.getById(id),
          ]);
          const locationName = loc?.storeName?.trim() || "Location";
          return { id, result, locationName };
        }),
      );
      const items = perLocation.flatMap(({ id, result, locationName }) =>
        result.items.map((item) => ({
          ...item,
          locationId: id,
          locationName,
        })),
      );
      items.sort((a, b) => {
        const aTs = a.appliedAt ? new Date(a.appliedAt).getTime() : -1;
        const bTs = b.appliedAt ? new Date(b.appliedAt).getTime() : -1;
        return bTs - aTs;
      });
      const total = items.length;
      res.json({
        success: true,
        data: items,
        meta: { total, page: 1, limit: total, totalPages: 1 },
      });
      return;
    }

    const result = await service.getByLocationAndDate(locationId, date);
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (err) {
    next(err);
  }
}
