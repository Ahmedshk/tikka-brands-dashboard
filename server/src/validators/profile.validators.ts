import { z } from 'zod';
import { strongPasswordSchema } from './password.validators.js';

export const putProfileBodySchema = z.object({
  body: z.object({
    profileImagePublicId: z.union([z.string().min(1), z.null()]),
  }),
});

export const changePasswordBodySchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: strongPasswordSchema,
      confirmPassword: z.string().min(1, 'Please confirm your password'),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    })
    .refine((d) => d.currentPassword !== d.newPassword, {
      message: 'New password must be different from your current password',
      path: ['newPassword'],
    }),
});
