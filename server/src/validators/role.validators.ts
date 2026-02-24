import { z } from "zod";

const pagePermissionSchema = z.object({
  pageId: z.string().min(1),
  pageLabel: z.string().min(1),
  components: z.array(z.string()).optional(),
});

const rolePermissionsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }),
  z.object({
    type: z.literal("custom"),
    pages: z.array(pagePermissionSchema),
  }),
]);

export const listRolesQuerySchema = z.object({
  query: z.object({
    activeOnly: z.enum(["true", "false"]).optional(),
  }),
});

export const getRoleParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Role ID is required"),
  }),
});

export const deleteRoleParamsSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Role ID is required"),
  }),
});

const roleLocationsSchema = z.union([
  z.literal("all"),
  z.array(z.string().min(1)), // empty array = none; non-empty = specific locations
]);

export const createRoleSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Role name is required").trim(),
    description: z.string().trim().optional(),
    permissions: rolePermissionsSchema,
    locations: roleLocationsSchema.optional().default("all"),
  }),
});

export const updateRoleSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Role ID is required"),
  }),
  body: z.object({
    name: z.string().min(1, "Role name is required").trim().optional(),
    description: z.string().trim().optional(),
    permissions: rolePermissionsSchema.optional(),
    locations: roleLocationsSchema.optional(),
  }),
});
