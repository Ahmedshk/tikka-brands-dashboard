import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export const listUsersQuerySchema = z.object({
  query: z
    .object({
      search: z.string().trim().optional(),
      roleId: z.string().min(1).optional(),
      locationId: z.string().min(1).optional(),
    })
    .extend(paginationSchema.shape),
});

export const createUserSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required').trim(),
    lastName: z.string().min(1, 'Last name is required').trim(),
    email: z.string().trim().pipe(z.email({ message: 'Invalid email' })),
    phone: z.string().trim().optional(),
    squareId: z.string().trim().optional(),
    homebaseId: z.string().trim().optional(),
    roleId: z.string().min(1).optional().nullable(),
    invite: z.boolean().optional(),
    profileImagePublicId: z.string().trim().optional().nullable(),
  }),
});

const pagePermissionSchema = z.object({
  pageId: z.string().min(1),
  pageLabel: z.string().min(1),
  components: z.array(z.string()).optional(),
});

const permissionOverridesSchema = z.union([
  z.null(),
  z.object({
    type: z.literal('custom'),
    pages: z.array(pagePermissionSchema),
  }),
]);

export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'User ID is required'),
  }),
  body: z.object({
    firstName: z.string().min(1, 'First name is required').trim().optional(),
    lastName: z.string().min(1, 'Last name is required').trim().optional(),
    email: z.string().trim().pipe(z.email({ message: 'Invalid email' })).optional(),
    phone: z.string().trim().optional(),
    squareId: z.string().trim().optional(),
    homebaseId: z.string().trim().optional(),
    roleId: z.string().min(1).optional().nullable(),
    isActive: z.boolean().optional(),
    profileImagePublicId: z.string().trim().optional().nullable(),
    permissionOverrides: permissionOverridesSchema.optional(),
    locationOverrides: z.array(z.string().min(1)).optional().nullable(),
    permissionRemovals: permissionOverridesSchema.optional(),
    locationRemovals: z.array(z.string().min(1)).optional().nullable(),
  }),
});

export const deleteUserParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'User ID is required'),
  }),
});

export const resendInviteParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'User ID is required'),
  }),
});

export const syncFromSquareSchema = z.object({
  body: z.object({
    locationId: z.string().min(1, 'Location ID is required'),
  }),
});
