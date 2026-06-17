import type { Request, Response, NextFunction } from "express";
import { ValidationError, ForbiddenError } from "../utils/errors.util.js";
import { KitchenPerformanceService } from "../services/kitchenPerformance.service.js";
import { uploadKitchenPerformanceCsvMulter } from "../middleware/upload-kitchen-performance.middleware.js";
import { resolveTargetLocationIds } from "../utils/locationScope.js";

const service = new KitchenPerformanceService();

function hasLocationAccess(req: Request, locationId: string): boolean {
  const allowed = req.user?.allowedLocationIds;
  const locationRemovals = req.user?.locationRemovals ?? [];
  if (locationRemovals.includes(locationId)) return false;
  if (!allowed || allowed === "all") return true;
  return allowed.includes(locationId);
}

export function handleKitchenPerformanceUploadError(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  uploadKitchenPerformanceCsvMulter(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const e = err as Error & { code?: string };
    if (e.code === "LIMIT_FILE_SIZE") {
      next(new ValidationError("CSV file too large. Maximum size is 10 MB."));
      return;
    }
    next(new ValidationError(e.message || "CSV upload failed."));
  });
}

export async function getKitchenPerformance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      startDate,
      endDate,
      page: pageRaw,
      limit: limitRaw,
    } = req.query as {
      locationId?: string;
      startDate: string;
      endDate: string;
      page?: string;
      limit?: string;
    };

    const page = Number.parseInt(pageRaw ?? "1", 10);
    const limit = Number.parseInt(limitRaw ?? "10", 10);

    const targetIds = await resolveTargetLocationIds(req);
    if (targetIds.length > 1) {
      const results = await Promise.all(
        targetIds.map((id) =>
          service.getByLocationAndDateRange(id, startDate, endDate, 1, 10_000),
        ),
      );
      const all = results.flatMap((r) => r.items);
      // Global pagination across concatenated rows (do not sum across locations; rows already contain location name).
      const total = all.length;
      const totalPages = Math.max(1, Math.ceil(total / (Number.isNaN(limit) ? 10 : limit)));
      const safePage = Math.min(Math.max(1, Number.isNaN(page) ? 1 : page), totalPages);
      const startIndex = (safePage - 1) * (Number.isNaN(limit) ? 10 : limit);
      const items = all.slice(startIndex, startIndex + (Number.isNaN(limit) ? 10 : limit));
      res.json({
        success: true,
        data: items,
        meta: { total, page: safePage, limit: Number.isNaN(limit) ? 10 : limit, totalPages },
      });
      return;
    }

    const singleLocationId = targetIds[0]!;
    const result = await service.getByLocationAndDateRange(
      singleLocationId,
      startDate,
      endDate,
      Number.isNaN(page) ? 1 : page,
      Number.isNaN(limit) ? 10 : limit,
    );
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

export async function importKitchenPerformanceCsv(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorUserId = req.user?.userId;
    if (!actorUserId) {
      throw new ValidationError("Authentication required.");
    }

    const { locationId, startDate, endDate } = req.body as {
      locationId: string;
      startDate: string;
      endDate: string;
    };
    if (!hasLocationAccess(req, locationId)) {
      throw new ForbiddenError("You do not have access to this location.");
    }

    const file = req.file;
    if (!file?.buffer) {
      throw new ValidationError('No CSV file provided. Use multipart field "file".');
    }

    const data = await service.importCsv(
      actorUserId,
      locationId,
      startDate,
      endDate,
      file.buffer,
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getKitchenPerformanceDetails(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { locationId, startDate, endDate, deviceName } = req.query as {
      locationId: string;
      startDate: string;
      endDate: string;
      deviceName: string;
    };
    const details = await service.getDetailsByLocationDateRangeAndDevice(
      locationId,
      startDate,
      endDate,
      deviceName,
    );
    res.json({ success: true, data: details });
  } catch (err) {
    next(err);
  }
}
