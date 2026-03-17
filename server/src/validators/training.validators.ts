import { z } from 'zod';

const trainingModuleFileSchema = z.object({
  publicId: z.string().min(1, 'publicId is required'),
  resourceType: z.enum(['image', 'raw']),
  filename: z.string().max(500).optional(),
  format: z.string().max(20).optional(),
});

const trainingModuleSchema = z.object({
  name: z.string().min(1, 'Module name is required').max(200, 'Module name too long'),
  duration: z.number().int().min(1, 'Duration (days) is required and must be at least 1'),
  moduleFiles: z.array(trainingModuleFileSchema).default([]),
});

const assignToRolesSchema = z.union([
  z.literal('all'),
  z.array(z.string().min(1)),
]);

const trainingIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Training ID is required'),
  }),
});

export const createTrainingSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Training name is required').max(200, 'Training name too long'),
    modules: z.array(trainingModuleSchema).min(1, 'At least one module is required'),
    assignToRoles: assignToRolesSchema.optional(),
  }),
});

export const updateTrainingSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Training ID is required'),
  }),
  body: z.object({
    name: z.string().min(1, 'Training name is required').max(200, 'Training name too long'),
    modules: z.array(trainingModuleSchema).min(1, 'At least one module is required'),
    assignToRoles: assignToRolesSchema.optional(),
  }),
});

export const getTrainingByIdSchema = trainingIdParamSchema;
export const deleteTrainingSchema = trainingIdParamSchema;
