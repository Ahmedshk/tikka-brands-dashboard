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
    // `null` clears membership; the string form must be a valid ObjectId.
    groupId: z.string().trim().min(1).nullable().optional(),
  }),
});
