import { z } from 'zod';

export const getInventoryKPIsQuerySchema = z.object({
  query: z.object({
    locationId: z.string().min(1, 'Location ID is required'),
  }),
});
