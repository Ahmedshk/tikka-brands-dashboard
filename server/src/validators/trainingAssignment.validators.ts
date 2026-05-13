import { z } from 'zod';
import { parseModuleProgressCompletedAtInput } from '../utils/trainingAssignmentValidatorsHelpers.util.js';

const extraFileSchema = z.object({
  publicId: z.string().min(1),
  resourceType: z.enum(['image', 'raw']),
  filename: z.string().optional(),
  format: z.string().optional(),
});

const moduleProgressEntrySchema = z.object({
  completedAt: z
    .union([z.date(), z.string(), z.null()])
    .nullable()
    .transform((v) => parseModuleProgressCompletedAtInput(v)),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  managerNotes: z.string().max(2000).optional(),
  extraFiles: z.array(extraFileSchema).optional(),
});

export const createAssignmentsSchema = z.object({
  body: z.object({
    trainingId: z.string().min(1, 'trainingId is required'),
    userIds: z.array(z.string().min(1)).min(1, 'userIds must be a non-empty array'),
  }),
});

export const listAssignmentsSchema = z.object({
  query: z.object({
    locationId: z.string().min(1, 'locationId is required'),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const getAssignmentByIdSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Assignment ID is required'),
  }),
});

export const updateAssignmentSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Assignment ID is required'),
  }),
  body: z.object({
    moduleProgress: z.array(moduleProgressEntrySchema),
  }),
});

export const deleteAssignmentSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Assignment ID is required'),
  }),
});
