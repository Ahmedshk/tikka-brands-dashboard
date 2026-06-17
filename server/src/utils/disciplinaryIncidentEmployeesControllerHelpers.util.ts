import type { Request } from "express";
import { parseLocationIdsFromQuery, resolveTargetLocationIds } from "./locationScope.js";
import type { DisciplinaryIncidentService } from "../services/disciplinaryIncident.service.js";
import type { DisciplinaryEmployeeListItem } from "../types/disciplinary.types.js";

type EmployeesResult = {
  items: DisciplinaryEmployeeListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    criticalCount: number;
    pendingCount: number;
    totalActive: number;
  };
};

function parsePositiveInt(raw: unknown, fallback: number): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isNaN(n) || n <= 0 ? fallback : n;
}

function paginate<T>(
  all: T[],
  page: number,
  limit: number,
): { items: T[]; page: number; limit: number; totalPages: number } {
  const safeLimit = limit;
  const totalPages = Math.max(1, Math.ceil(all.length / safeLimit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safeLimit;
  return {
    items: all.slice(start, start + safeLimit),
    page: safePage,
    limit: safeLimit,
    totalPages,
  };
}

function buildMeta(
  all: DisciplinaryEmployeeListItem[],
  page: number,
  limit: number,
  totalPages: number,
) {
  const criticalCount = all.filter((e) => e.status === "Critical").length;
  const pendingCount = all.reduce(
    (sum, e) => sum + (e.eSignStatus.type === "pending" ? e.eSignStatus.count : 0),
    0,
  );
  return {
    total: all.length,
    page,
    limit,
    totalPages,
    criticalCount,
    pendingCount,
    totalActive: all.length,
  };
}

function parseQuery(req: Request): {
  locationId: string;
  page: number;
  limit: number;
  search?: string;
} {
  const q = req.query as { locationId?: unknown; page?: unknown; limit?: unknown; search?: unknown };
  const locationId = typeof q.locationId === "string" ? q.locationId : "";
  const page = parsePositiveInt(q.page, 1);
  const limit = parsePositiveInt(q.limit, 10);
  return {
    locationId,
    page,
    limit,
    ...(typeof q.search === "string" ? { search: q.search } : {}),
  };
}

export async function getEmployeesForRequest(args: {
  req: Request;
  actorUserId: string;
  service: DisciplinaryIncidentService;
}): Promise<
  | { kind: "bad_request"; message: string }
  | { kind: "ok"; result: EmployeesResult }
> {
  const { req, actorUserId, service } = args;
  const { page, limit, search } = parseQuery(req);
  const explicitIds = parseLocationIdsFromQuery(req);
  const locationId =
    explicitIds.length > 0
      ? explicitIds[0]!
      : typeof req.query.locationId === "string"
        ? req.query.locationId
        : "";
  if (!locationId && explicitIds.length === 0) {
    return { kind: "bad_request", message: "locationId is required" };
  }

  const targetIds = await resolveTargetLocationIds(req);
  if (targetIds.length === 1) {
    const result = await service.getEmployeesForLocation(actorUserId, targetIds[0]!, {
      page,
      limit,
      ...(search ? { search } : {}),
    });
    return { kind: "ok", result };
  }

  const results = await Promise.all(
    targetIds.map((id) =>
      service.getEmployeesForLocation(actorUserId, id, {
        page: 1,
        limit: 10_000,
        ...(search ? { search } : {}),
      }),
    ),
  );

  const byId = new Map<string, DisciplinaryEmployeeListItem>();
  for (const r of results) {
    for (const item of r.items) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }

  const all = Array.from(byId.values());
  const paged = paginate(all, page, limit);

  return {
    kind: "ok",
    result: {
      items: paged.items,
      meta: buildMeta(all, paged.page, paged.limit, paged.totalPages),
    },
  };
}

