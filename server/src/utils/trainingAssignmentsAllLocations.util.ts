import type { Request } from 'express';
import type { TrainingAssignmentService } from '../services/trainingAssignment.service.js';
import { resolveEffectiveAllowedLocationIds } from './locationScope.js';

export async function listTrainingAssignmentsAllLocations(params: {
  req: Request;
  assignmentService: TrainingAssignmentService;
  search?: string;
  limit?: number;
}): Promise<{ assignments: unknown[]; total: number }> {
  const { req, assignmentService, search, limit } = params;
  const effectiveIds = await resolveEffectiveAllowedLocationIds(req);
  const searchTrim = search?.trim();

  const results = await Promise.all(
    effectiveIds.map((id) =>
      assignmentService.listByLocationId(id, {
        ...(searchTrim ? { search: searchTrim } : {}),
      }),
    ),
  );

  const byId = new Map<string, unknown>();
  for (const r of results) {
    for (const item of r.list) {
      if (!byId.has(item._id)) byId.set(item._id, item);
    }
  }

  let list = Array.from(byId.values()) as Array<{ assignTo?: string } & Record<string, unknown>>;
  if (searchTrim) {
    const needle = searchTrim.toLowerCase();
    list = list.filter((item) => (item.assignTo ?? '').toLowerCase().includes(needle));
  }
  const total = list.length;

  if (limit != null && Number.isFinite(limit) && limit > 0 && list.length > limit) {
    list = list.slice(0, limit);
  }

  return { assignments: list, total };
}

