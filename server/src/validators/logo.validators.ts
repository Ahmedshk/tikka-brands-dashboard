import { z } from 'zod';

const DATA_URL_REGEX = /^data:image\/[a-zA-Z+.-]+;base64,/;
const MAX_LENGTH = 500 * 1024; // 500KB

export const createLogoSchema = z.object({
  body: z.object({
    dataUrl: z
      .string()
      .min(1, 'dataUrl is required')
      .max(MAX_LENGTH, `Logo must not exceed ${MAX_LENGTH / 1024}KB`)
      .refine((val) => DATA_URL_REGEX.test(val), {
        message: 'dataUrl must be a base64 image data URL (data:image/...;base64,...)',
      }),
  }),
});

export const getLogoSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Logo ID is required'),
  }),
});
