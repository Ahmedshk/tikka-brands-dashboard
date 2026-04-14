import type { Request, Response, NextFunction } from "express";
import { DisciplinaryIncidentService } from "../services/disciplinaryIncident.service.js";
import { isAllLocationsId, resolveEffectiveAllowedLocationIds } from "../utils/locationScope.js";

const service = new DisciplinaryIncidentService();

export async function getEmployees(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      locationId,
      page: pageRaw,
      limit: limitRaw,
      search,
    } = req.query as {
      locationId: string;
      page?: string;
      limit?: string;
      search?: string;
    };
    const actorUserId = (req as unknown as { user: { userId: string } }).user
      .userId;
    const page = Number.parseInt(pageRaw ?? "1", 10);
    const limit = Number.parseInt(limitRaw ?? "10", 10);

    if (isAllLocationsId(locationId)) {
      const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
      const results = await Promise.all(
        effectiveIds.map((id) =>
          service.getEmployeesForLocation(actorUserId, id, {
            page: 1,
            limit: 10_000,
            search,
          }),
        ),
      );
      const byId = new Map<string, (typeof results)[number]["items"][number]>();
      for (const r of results) {
        for (const item of r.items) {
          if (!byId.has(item.id)) byId.set(item.id, item);
        }
      }
      const all = Array.from(byId.values());
      const total = all.length;
      const safeLimit = Number.isNaN(limit) ? 10 : limit;
      const totalPages = Math.max(1, Math.ceil(total / safeLimit));
      const safePage = Math.min(Math.max(1, Number.isNaN(page) ? 1 : page), totalPages);
      const start = (safePage - 1) * safeLimit;
      const items = all.slice(start, start + safeLimit);

      const criticalCount = all.filter((e) => e.status === "Critical").length;
      const pendingCount = all.reduce(
        (sum, e) => sum + (e.eSignStatus.type === "pending" ? e.eSignStatus.count : 0),
        0,
      );
      res.json({
        success: true,
        data: items,
        meta: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages,
          criticalCount,
          pendingCount,
          totalActive: total,
        },
      });
      return;
    }

    const result = await service.getEmployeesForLocation(
      actorUserId,
      locationId,
      {
        page: Number.isNaN(page) ? 1 : page,
        limit: Number.isNaN(limit) ? 10 : limit,
        search,
      },
    );
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

export async function getEmployeeDetails(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const employeeId = req.params.employeeId as string;
    const actorUserId = (req as unknown as { user: { userId: string } }).user
      .userId;

    const details = await service.getEmployeeDetails(actorUserId, employeeId);
    res.json({ success: true, data: details });
  } catch (err) {
    next(err);
  }
}

export async function getEmployeeIncidents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const employeeId = req.params.employeeId as string;
    const page = Number.parseInt(req.query.page as string, 10) || 1;
    const limit = Number.parseInt(req.query.limit as string, 10) || 20;

    const result = await service.getIncidentsForEmployee(employeeId, {
      page,
      limit,
    });
    res.json({
      success: true,
      data: result.incidents,
      meta: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createIncident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorUserId = (req as unknown as { user: { userId: string } }).user
      .userId;

    const incident = await service.createIncident(actorUserId, req.body);
    res.status(201).json({ success: true, data: incident });
  } catch (err) {
    next(err);
  }
}

export async function sendForSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorUserId = (req as unknown as { user: { userId: string } }).user
      .userId;
    const employeeId = req.params.employeeId as string;

    const data = await service.sendDisciplinaryIncidentForSignature(
      actorUserId,
      employeeId,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getEmbeddedSignUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorUserId = (req as unknown as { user: { userId: string } }).user
      .userId;
    const incidentId = req.params.incidentId as string;

    const data = await service.getDisciplinaryIncidentEmbeddedSignUrl(
      actorUserId,
      incidentId,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
