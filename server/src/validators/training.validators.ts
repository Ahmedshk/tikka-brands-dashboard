import { z } from 'zod';

const trainingModuleFileSchema = z.object({
  publicId: z.string().min(1, 'publicId is required'),
  resourceType: z.enum(['image', 'raw']),
});

const trainingModuleSchema = z.object({
  name: z.string().min(1, 'Module name is required').max(200, 'Module name too long'),
  moduleFiles: z.array(trainingModuleFileSchema).default([]),
});

const assignToRolesSchema = z.union([
  z.literal('all'),
  z.array(z.string().min(1)),
]);

export const createTrainingSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Training name is required').max(200, 'Training name too long'),
    modules: z.array(trainingModuleSchema).min(1, 'At least one module is required'),
    assignToRoles: assignToRolesSchema.optional(),
  }),
});
