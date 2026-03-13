import api from './api.service';
import { API_BASE_URL, API_ENDPOINTS } from '../utils/constants';
import { ApiResponse } from '../types';
import type { Training } from '../types/trainingReviews.types';

const BASE = API_ENDPOINTS.TRAININGS;

export interface TrainingModuleFilePayload {
  publicId: string;
  resourceType: 'image' | 'raw';
}

export interface TrainingModulePayload {
  name: string;
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
    moduleFiles: TrainingModuleFilePayload[];
  }>;
  createdAt: string;
  updatedAt: string;
}

function toTraining(apiTraining: ApiTraining): Training {
  return {
    id: apiTraining._id,
    name: apiTraining.name,
    moduleCount: apiTraining.modules?.length ?? 0,
  };
}

export const trainingService = {
  async uploadDocument(file: File, trainingName: string): Promise<{ publicId: string; resourceType: 'image' | 'raw' }> {
    const form = new FormData();
    form.append('file', file);
    form.append('trainingName', trainingName);
    const res = await api.post<ApiResponse<{ publicId: string; resourceType: 'image' | 'raw' }>>(
      `${BASE}/upload-document`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    if (!res.data.success || !res.data.data?.publicId) {
      throw new Error(res.data.message ?? 'Failed to upload document');
    }
    return {
      publicId: res.data.data.publicId,
      resourceType: res.data.data.resourceType ?? 'raw',
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
