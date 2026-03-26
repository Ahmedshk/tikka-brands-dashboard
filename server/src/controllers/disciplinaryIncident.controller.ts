import type { Request, Response, NextFunction } from "express";
import { DisciplinaryIncidentService } from "../services/disciplinaryIncident.service.js";

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
