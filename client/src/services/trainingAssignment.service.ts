import api from './api.service';
import type { LocationApiParams } from '../utils/locationSelectionHelpers';
import { resolveLocationQuery } from '../utils/locationSelectionHelpers';
import { API_ENDPOINTS } from '../utils/constants';
import { ApiResponse } from '../types';
import type {
  EmployeeTrainingRow,
  AssignmentDetail,
  UpdateAssignmentPayload,
  ModuleProgressListItem,
  AssignmentExtraFile,
} from '../types/trainingReviews.types';

const BASE = `${API_ENDPOINTS.TRAININGS}/assignments`;

function toEmployeeTrainingRow(item: {
  _id: string;
  userId: string;
  trainingId: string;
  assignedAt: string;
  trainingName: string;
  moduleCount: number;
  assignTo: string;
  locationId?: string;
  locationName?: string | null;
  profileImagePublicId?: string | null;
  role: string;
  completedModules: number;
  totalModules: number;
  status: 'Complete' | 'Pending' | 'NotStarted';
  moduleDurations?: number[];
  moduleProgress?: ModuleProgressListItem[];
}): EmployeeTrainingRow {
  const total = item.totalModules || 1;
  const progress = Math.round(((item.completedModules ?? 0) / total) * 100);
  return {
    assignmentId: item._id,
    userId: item.userId,
    trainingId: item.trainingId,
    trainingName: item.trainingName,
    assignTo: item.assignTo,
    ...(item.locationId != null && item.locationId !== "" ? { locationId: item.locationId } : {}),
    ...(item.locationName !== undefined ? { locationName: item.locationName } : {}),
    ...(item.profileImagePublicId !== undefined ? { profileImagePublicId: item.profileImagePublicId } : {}),
    role: item.role,
    progress,
    status: item.status,
    completedModules: item.completedModules,
    totalModules: item.totalModules,
    assignedAt: item.assignedAt,
    moduleDurations: item.moduleDurations ?? [],
    moduleProgress: item.moduleProgress ?? [],
  };
}

function toAssignmentDetail(data: {
  _id: string;
  userId: string;
  trainingId: string;
  assignedAt: string;
  assignedBy?: string;
  moduleProgress: Array<{
    completedAt: string | null;
    status: 'not_started' | 'in_progress' | 'completed';
    managerNotes?: string;
    extraFiles?: Array<{
      publicId: string;
      resourceType: 'image' | 'raw';
      filename?: string;
      format?: string;
    }>;
  }>;
  user: { name: string; email: string; role: string };
  training: {
    name: string;
    modules: Array<{
      name: string;
      duration?: number;
      moduleFiles: Array<{
        publicId: string;
        resourceType: 'image' | 'raw';
        filename?: string;
        format?: string;
      }>;
    }>;
  };
}): AssignmentDetail {
  return {
    id: data._id,
    userId: data.userId,
    trainingId: data.trainingId,
    assignedAt: data.assignedAt,
    ...(data.assignedBy != null && { assignedBy: data.assignedBy }),
    moduleProgress: data.moduleProgress?.map((p) => {
      const entry: {
        completedAt: string | null;
        status: 'not_started' | 'in_progress' | 'completed';
        managerNotes?: string;
        extraFiles?: AssignmentExtraFile[];
      } = {
        completedAt: p.completedAt,
        status: p.status,
        ...(p.managerNotes != null && { managerNotes: p.managerNotes }),
      };
      const ef = (p as { extraFiles?: Array<{ publicId: string; resourceType: 'image' | 'raw'; filename?: string; format?: string }> }).extraFiles;
      if (ef?.length) {
        entry.extraFiles = ef.map((f) => ({
          publicId: f.publicId,
          resourceType: f.resourceType,
          ...(f.filename != null && { filename: f.filename }),
          ...(f.format != null && { format: f.format }),
        }));
      }
      return entry;
    }) ?? [],
    user: data.user,
    training: {
      name: data.training.name,
      modules: data.training.modules?.map((m) => ({
        name: m.name,
        duration: typeof m.duration === 'number' && m.duration >= 1 ? m.duration : 1,
        moduleFiles: m.moduleFiles?.map((f) => ({
          publicId: f.publicId,
          resourceType: f.resourceType,
          ...(f.filename != null && { filename: f.filename }),
          ...(f.format != null && { format: f.format }),
        })) ?? [],
      })) ?? [],
    },
  };
}

export interface ListAssignmentsOptions {
  search?: string;
  limit?: number;
  signal?: AbortSignal;
}

export const trainingAssignmentService = {
  async listAssignments(
    locationQuery: LocationApiParams | string,
    options?: ListAssignmentsOptions
  ): Promise<{ rows: EmployeeTrainingRow[]; total: number }> {
    const locationParams = resolveLocationQuery(locationQuery);
    if (!locationParams.locationId && !locationParams.locationIds) {
      return { rows: [], total: 0 };
    }
    const params: Record<string, string | number> = { ...locationParams };
    const search = options?.search?.trim();
    if (search) params.search = search;
    if (options?.limit != null && options.limit > 0) params.limit = options.limit;
    const res = await api.get<
      ApiResponse<{ assignments: unknown[]; total?: number }>
    >(BASE, {
      params,
      signal: options?.signal,
    });
    if (!res.data.success || !Array.isArray(res.data.data?.assignments)) {
      return { rows: [], total: 0 };
    }
    const rows = res.data.data.assignments.map((a: unknown) =>
      toEmployeeTrainingRow(a as Parameters<typeof toEmployeeTrainingRow>[0])
    );
    const total =
      typeof res.data.data.total === "number"
        ? res.data.data.total
        : rows.length;
    return { rows, total };
  },

  async getAssignmentById(id: string): Promise<AssignmentDetail | null> {
    const res = await api.get<ApiResponse<{ assignment: unknown }>>(`${BASE}/${id}`);
    if (!res.data.success || !res.data.data?.assignment) {
      return null;
    }
    return toAssignmentDetail(res.data.data.assignment as Parameters<typeof toAssignmentDetail>[0]);
  },

  async createAssignments(
    trainingId: string,
    userIds: string[]
  ): Promise<{ created: number }> {
    const res = await api.post<ApiResponse<{ created: number }>>(BASE, {
      trainingId,
      userIds,
    });
    if (!res.data.success || res.data.data?.created == null) {
      throw new Error(res.data.message ?? 'Failed to create assignments');
    }
    return { created: res.data.data.created };
  },

  async uploadAssignmentDocument(
    id: string,
    file: File
  ): Promise<AssignmentExtraFile> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.put<ApiResponse<{ publicId: string; resourceType: 'image' | 'raw'; filename?: string; format?: string }>>(
      `${BASE}/${id}/upload-document`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.message ?? 'Upload failed');
    }
    const d = res.data.data;
    return {
      publicId: d.publicId,
      resourceType: d.resourceType,
      ...(d.filename != null && { filename: d.filename }),
      ...(d.format != null && { format: d.format }),
    };
  },

  async updateAssignment(
    id: string,
    payload: UpdateAssignmentPayload
  ): Promise<AssignmentDetail> {
    const res = await api.put<ApiResponse<{ assignment: unknown }>>(
      `${BASE}/${id}`,
      payload
    );
    if (!res.data.success || !res.data.data?.assignment) {
      throw new Error(res.data.message ?? 'Failed to update assignment');
    }
    return toAssignmentDetail(res.data.data.assignment as Parameters<typeof toAssignmentDetail>[0]);
  },

  async deleteAssignment(id: string): Promise<void> {
    const res = await api.delete<ApiResponse<{ deleted: boolean }>>(`${BASE}/${id}`);
    if (!res.data.success) {
      throw new Error(res.data.message ?? 'Failed to delete assignment');
    }
  },
};
