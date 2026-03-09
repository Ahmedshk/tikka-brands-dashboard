import { useState, useRef, useEffect, type ReactNode } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  secondaryLabel?: string;
}

export interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  'aria-label': string;
  className?: string;
  /** When true, position list above the trigger. Default false (open below). */
  openAbove?: boolean;
  /** When true, include an empty option showing placeholder. Default true. */
  allowEmpty?: boolean;
  disabled?: boolean;
  /** Optional custom content for the trigger (e.g. icon + text). When set, replaces default label. */
  triggerLabel?: ReactNode;
  /** Called when the dropdown open state changes (e.g. for fetch-on-open). */
  onOpenChange?: (open: boolean) => void;
}

const triggerBaseClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-primary bg-white focus:outline-none focus:ring-2 focus:ring-gray-300/50 min-w-0 text-left flex items-center justify-between gap-2 disabled:opacity-70 disabled:cursor-not-allowed';
const listBaseClass =
  'absolute left-0 right-0 z-50 w-full min-w-0 max-h-48 overflow-y-auto dropdown-list-scrollbar bg-white border border-gray-300 rounded-lg shadow-lg py-1';

export function Dropdown({
  options,
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  className = '',
  openAbove = false,
  allowEmpty = true,
  disabled = false,
  triggerLabel,
  onOpenChange,
}: Readonly<DropdownProps>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  // Only notify when open state changes; do not depend on onOpenChange so that a new
  // callback reference from the parent (e.g. inline function) does not re-run and refetch.
  useEffect(() => {
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only when open changes
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleToggle = () => {
    if (disabled) return;
    setOpen((o) => !o);
  };

  const listPositionClass = openAbove ? 'bottom-full mb-1' : 'top-full mt-1';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`${triggerBaseClass} ${!selectedOption && triggerLabel == null ? 'text-secondary' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="truncate">
          {triggerLabel ?? displayLabel}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className={`${listBaseClass} ${listPositionClass}`}
          aria-label={ariaLabel}
        >
          {allowEmpty && (
            <div role="none">
              <button
                type="button"
                role="menuitem"
                aria-current={value === '' ? 'true' : undefined}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none ${value === '' ? 'bg-gray-100 font-medium text-primary' : 'text-primary'}`}
              >
                {placeholder}
              </button>
            </div>
          )}
          {options.map((opt) => (
            <div key={opt.value} role="none">
              <button
                type="button"
                role="menuitem"
                aria-current={value === opt.value ? 'true' : undefined}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none ${value === opt.value ? 'bg-gray-100 font-medium text-primary' : 'text-primary'} ${opt.secondaryLabel ? '' : 'truncate'}`}
              >
                <span className="block truncate">{opt.label}</span>
                {opt.secondaryLabel != null && (
                  <span className="block text-[10px] md:text-xs 2xl:text-sm text-gray-500 truncate mt-0.5">
                    {opt.secondaryLabel}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
