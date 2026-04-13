import { z } from 'zod';

export const getLogoSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Logo ID is required'),
  }),
});
