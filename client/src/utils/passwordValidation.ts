const MIN_LENGTH = 8;
const HAS_LOWERCASE = /[a-z]/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_NUMBER = /\d/;
const HAS_SYMBOL = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\';~`]/;

export interface PasswordChecks {
  minLength: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  symbol: boolean;
}

export function getPasswordChecks(password: string): PasswordChecks {
  return {
    minLength: password.length >= MIN_LENGTH,
    lowercase: HAS_LOWERCASE.test(password),
    uppercase: HAS_UPPERCASE.test(password),
    number: HAS_NUMBER.test(password),
    symbol: HAS_SYMBOL.test(password),
  };
}

export function isPasswordStrong(password: string): boolean {
  const c = getPasswordChecks(password);
  return c.minLength && c.lowercase && c.uppercase && c.number && c.symbol;
}

export const PASSWORD_REQUIREMENTS = {
  minLength: MIN_LENGTH,
  minLengthLabel: 'At least 8 characters',
  lowercaseLabel: 'One lowercase letter',
  uppercaseLabel: 'One uppercase letter',
  numberLabel: 'One number',
  symbolLabel: 'One symbol',
} as const;
