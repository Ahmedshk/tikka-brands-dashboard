import type { Request, Response, NextFunction } from "express";
import { DisciplinaryIncidentService } from "../services/disciplinaryIncident.service.js";
import { getEmployeesForRequest } from "../utils/disciplinaryIncidentEmployeesControllerHelpers.util.js";

const service = new DisciplinaryIncidentService();

export async function getEmployees(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorUserId = (req as unknown as { user: { userId: string } }).user
      .userId;
    const result = await getEmployeesForRequest({ req, actorUserId, service });
    if (result.kind === "bad_request") {
      res.status(400).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, data: result.result.items, meta: result.result.meta });
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
