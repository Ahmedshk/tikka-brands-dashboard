import api from './api.service';
import { API_BASE_URL, API_ENDPOINTS } from '../utils/constants';
import { ApiResponse } from '../types';
import type { Training, TrainingDetail } from '../types/trainingReviews.types';

const BASE = API_ENDPOINTS.TRAININGS;

/** Minimal role row from GET /trainings/role-hierarchy (for hierarchy without rbac-management). */
export interface TrainingRoleHierarchyRow {
  id: string;
  roleName: string;
  reportsTo: string | null;
}

export interface TrainingModuleFilePayload {
  publicId: string;
  resourceType: 'image' | 'raw';
  filename?: string;
  format?: string;
}

export interface TrainingModulePayload {
  name: string;
  /** Duration in number of days (required). */
  duration: number;
  moduleFiles: TrainingModuleFilePayload[];
}

export interface CreateTrainingPayload {
  name: string;
  modules: TrainingModulePayload[];
  /** Optional: 'all' or list of role IDs to assign this training to. */
  assignToRoles?: 'all' | string[];
}

export interface ApiTraining {
  _id: string;
  name: string;
  modules: Array<{
    name: string;
    duration?: number;
    moduleFiles: TrainingModuleFilePayload[];
  }>;
  assignToRoles?: 'all' | string[];
  createdAt: string;
  updatedAt: string;
}

function toTraining(apiTraining: ApiTraining): Training {
  const modules = apiTraining.modules ?? [];
  const durationDays = modules.reduce(
    (sum, m) => sum + (typeof m.duration === 'number' && m.duration >= 0 ? m.duration : 0),
    0
  );
  return {
    id: apiTraining._id,
    name: apiTraining.name,
    moduleCount: modules.length,
    durationDays,
  };
}

export const trainingService = {
  async uploadDocument(
    file: File,
    trainingName: string
  ): Promise<{
    publicId: string;
    resourceType: 'image' | 'raw';
    filename?: string;
    format?: string;
  }> {
    const form = new FormData();
    form.append('file', file);
    form.append('trainingName', trainingName);
    const res = await api.post<
      ApiResponse<{
        publicId: string;
        resourceType: 'image' | 'raw';
        filename?: string;
        format?: string;
      }>
    >(`${BASE}/upload-document`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    if (!res.data.success || !res.data.data?.publicId) {
      throw new Error(res.data.message ?? 'Failed to upload document');
    }
    return {
      publicId: res.data.data.publicId,
      resourceType: res.data.data.resourceType ?? 'raw',
      filename: res.data.data.filename,
      format: res.data.data.format,
    };
  },

  async create(payload: CreateTrainingPayload): Promise<Training> {
    const res = await api.post<ApiResponse<{ training: ApiTraining }>>(BASE, payload);
    if (!res.data.success || !res.data.data?.training) {
      throw new Error(res.data.message ?? 'Failed to create training');
    }
    return toTraining(res.data.data.training);
  },

  async list(): Promise<Training[]> {
    const res = await api.get<ApiResponse<{ trainings: ApiTraining[] }>>(BASE);
    if (!res.data.success || !Array.isArray(res.data.data?.trainings)) {
      return [];
    }
    return res.data.data.trainings.map(toTraining);
  },

  async listRoleHierarchySnapshot(
    activeOnly = false,
    config?: { signal?: AbortSignal },
  ): Promise<TrainingRoleHierarchyRow[]> {
    const res = await api.get<
      ApiResponse<{ roles: Array<{ id: string; name: string; reportsTo: string | null }> }>
    >(`${BASE}/role-hierarchy`, {
      params: activeOnly ? { activeOnly: 'true' } : undefined,
      signal: config?.signal,
    });
    if (!res.data.success || !Array.isArray(res.data.data?.roles)) {
      throw new Error(res.data.message ?? 'Failed to load role hierarchy');
    }
    return res.data.data.roles.map((r) => ({
      id: r.id,
      roleName: r.name,
      reportsTo: r.reportsTo ?? null,
    }));
  },

  async getById(id: string): Promise<TrainingDetail | null> {
    const res = await api.get<ApiResponse<{ training: ApiTraining }>>(`${BASE}/${id}`);
    if (!res.data.success || !res.data.data?.training) {
      return null;
    }
    const t = res.data.data.training;
    return {
      id: t._id,
      name: t.name,
      modules: t.modules?.map((m) => ({
        name: m.name,
        duration: typeof m.duration === 'number' && m.duration >= 1 ? m.duration : 1,
        moduleFiles:
          m.moduleFiles?.map((f) => ({
            publicId: f.publicId,
            resourceType: f.resourceType,
            ...(f.filename != null && { filename: f.filename }),
            ...(f.format != null && { format: f.format }),
          })) ?? [],
      })) ?? [],
      ...(t.assignToRoles != null && { assignToRoles: t.assignToRoles }),
    };
  },

  async update(id: string, payload: CreateTrainingPayload): Promise<Training> {
    const res = await api.put<ApiResponse<{ training: ApiTraining }>>(`${BASE}/${id}`, payload);
    if (!res.data.success || !res.data.data?.training) {
      throw new Error(res.data.message ?? 'Failed to update training');
    }
    return toTraining(res.data.data.training);
  },

  async delete(id: string): Promise<void> {
    const res = await api.delete<ApiResponse<{ deleted: boolean }>>(`${BASE}/${id}`);
    if (!res.data.success) {
      throw new Error(res.data.message ?? 'Failed to delete training');
    }
  },
};

/**
 * Build the proxy URL for a training document (client never sees Cloudinary URL).
 */
export function getDocumentProxyUrl(publicId: string, resourceType: 'image' | 'raw' = 'raw'): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const params = new URLSearchParams({ publicId });
  if (resourceType) params.set('resourceType', resourceType);
  return `${base}/proxy/document?${params.toString()}`;
}

/**
 * Fetch an image via the authenticated proxy and return an object URL for use in img src.
 * Caller must call URL.revokeObjectURL(url) when done to avoid leaks.
 */
export async function getDocumentImageBlobUrl(publicId: string): Promise<string> {
  const params = new URLSearchParams({ publicId, resourceType: 'image' });
  const res = await api.get<Blob>(`proxy/document?${params.toString()}`, {
    responseType: 'blob',
  });
  if (res.status !== 200 || !(res.data instanceof Blob)) {
    throw new Error('Failed to load image');
  }
  return URL.createObjectURL(res.data);
}

/**
 * Fetch the document via the authenticated proxy, then either download with correct filename or open in new tab.
 * When suggestedFilename is provided (e.g. Report.docx), triggers a download so the file is saved with the right extension.
 * Otherwise opens the blob in a new tab.
 */
export async function openDocumentProxyInNewTab(
  publicId: string,
  resourceType: 'image' | 'raw',
  suggestedFilename?: string
): Promise<void> {
  const params = new URLSearchParams({ publicId, resourceType });
  if (suggestedFilename) params.set('filename', suggestedFilename);
  const res = await api.get<Blob>(`proxy/document?${params.toString()}`, {
    responseType: 'blob',
  });
  if (res.status !== 200 || !(res.data instanceof Blob)) {
    throw new Error('Failed to load document');
  }
  const blob = res.data;
  const blobUrl = URL.createObjectURL(blob);
  if (suggestedFilename?.trim()) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = suggestedFilename.trim();
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } else {
    const w = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    else URL.revokeObjectURL(blobUrl);
  }
}
