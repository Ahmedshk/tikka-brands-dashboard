import { z } from "zod";

const locationIdsTransform = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    if (Array.isArray(val)) {
      return val.map((s) => s.trim()).filter(Boolean);
    }
    return val
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  })
  .pipe(z.array(z.string().min(1)).optional());

/** Shared query fields for location-scoped list/read endpoints that support multi-select. */
export const locationQueryFields = {
  locationId: z.string().min(1).optional(),
  locationIds: locationIdsTransform,
} as const;

export function withLocationQuery<T extends z.ZodRawShape>(extra: T) {
  return z
    .object({ ...locationQueryFields, ...extra })
    .superRefine((q, ctx) => {
      const locationId = (q as { locationId?: string }).locationId;
      const locationIds = (q as { locationIds?: string[] }).locationIds;
      const ok =
        (typeof locationId === "string" && locationId.length > 0) ||
        (Array.isArray(locationIds) && locationIds.length > 0);
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          message: "locationId or locationIds is required",
        });
      }
    });
}
