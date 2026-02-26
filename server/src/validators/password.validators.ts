import { z } from 'zod';

const MIN_LENGTH = 8;
const HAS_LOWERCASE = /[a-z]/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_NUMBER = /\d/;
const HAS_SYMBOL = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\';~`]/;

export const PASSWORD_REQUIREMENTS = {
  minLength: MIN_LENGTH,
  lowercase: true,
  uppercase: true,
  number: true,
  symbol: true,
} as const;

export const strongPasswordSchema = z
  .string()
  .min(MIN_LENGTH, 'Password must be at least 8 characters')
  .refine((val) => HAS_LOWERCASE.test(val), {
    message: 'Password must contain at least one lowercase letter',
  })
  .refine((val) => HAS_UPPERCASE.test(val), {
    message: 'Password must contain at least one uppercase letter',
  })
  .refine((val) => HAS_NUMBER.test(val), {
    message: 'Password must contain at least one number',
  })
  .refine((val) => HAS_SYMBOL.test(val), {
    message: 'Password must contain at least one symbol',
  });

export function validateStrongPassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < MIN_LENGTH) {
    errors.push('Password must be at least 8 characters');
  }
  if (!HAS_LOWERCASE.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!HAS_UPPERCASE.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!HAS_NUMBER.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!HAS_SYMBOL.test(password)) {
    errors.push('Password must contain at least one symbol');
  }
  return { valid: errors.length === 0, errors };
}
