import {
  getPasswordChecks,
  PASSWORD_REQUIREMENTS,
  type PasswordChecks,
} from '../../utils/passwordValidation';

interface PasswordChecklistProps {
  readonly password: string;
  readonly className?: string;
}

function CheckIcon({ met }: { met: boolean }) {
  return met ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4 text-green-600 shrink-0"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4 text-gray-300 shrink-0"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const ITEMS: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'minLength', label: PASSWORD_REQUIREMENTS.minLengthLabel },
  { key: 'lowercase', label: PASSWORD_REQUIREMENTS.lowercaseLabel },
  { key: 'uppercase', label: PASSWORD_REQUIREMENTS.uppercaseLabel },
  { key: 'number', label: PASSWORD_REQUIREMENTS.numberLabel },
  { key: 'symbol', label: PASSWORD_REQUIREMENTS.symbolLabel },
];

export function PasswordChecklist({ password, className = '' }: PasswordChecklistProps) {
  const checks = getPasswordChecks(password);

  return (
    <ul
      className={`text-sm text-primary space-y-1.5 ${className}`}
      aria-label="Password requirements"
    >
      {ITEMS.map(({ key, label }) => (
        <li
          key={key}
          className={`flex items-center gap-2 transition-colors ${
            checks[key] ? 'text-green-700' : 'text-gray-500'
          }`}
        >
          <CheckIcon met={checks[key]} />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
