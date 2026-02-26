import { z } from 'zod';
import { strongPasswordSchema } from './password.validators.js';

export const loginSchema = z.object({
  body: z.object({
    email: z.email(),
    password: z.string().min(6),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    email: z.email(),
    password: strongPasswordSchema,
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.string().optional(),
  }),
});

export const validateSetPasswordTokenQuerySchema = z.object({
  query: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
});

export const setPasswordBodySchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  }),
});

/** Reuse for reset-password flow when implemented (same rules as set-password). */
export const resetPasswordBodySchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  }),
});
