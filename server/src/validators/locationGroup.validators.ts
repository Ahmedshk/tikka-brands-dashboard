import { z } from 'zod';

const groupNameSchema = z.string().min(1, 'Group name is required').trim().max(120, 'Group name is too long');

export const createLocationGroupSchema = z.object({
  body: z.object({
    name: groupNameSchema,
  }),
});

export const updateLocationGroupSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: groupNameSchema.optional(),
  }),
});

export const getLocationGroupSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const deleteLocationGroupSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const reorderLocationGroupsSchema = z.object({
  body: z.object({
    groupIds: z.array(z.string().min(1)).min(1, 'groupIds is required'),
  }),
});

export const assignLocationGroupSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    // Explicit null clears all memberships for legacy API callers.
    groupId: z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid group ID').nullable(),
    action: z.enum(['add', 'remove']).default('add'),
  }),
});
