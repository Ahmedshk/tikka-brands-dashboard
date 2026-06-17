import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LocationListItem } from '../../types';
import { formatLocationTriggerLabel } from '../../utils/locationSelectionHelpers';

const triggerBaseClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-primary bg-white focus:outline-none focus:ring-2 focus:ring-gray-300/50 min-w-0 text-left flex items-center justify-between gap-2 disabled:opacity-70 disabled:cursor-not-allowed';
const listBaseClass =
  'absolute left-0 right-0 z-50 w-full min-w-0 max-h-48 overflow-y-auto dropdown-list-scrollbar bg-white border border-gray-300 rounded-lg shadow-lg py-1';

export type LocationMultiSelectDropdownProps = {
  locations: LocationListItem[];
  selectedIds: string[];
  onToggleLocation: (id: string) => void;
  onMasterCheckboxChange: () => void;
  disabled?: boolean;
  className?: string;
  triggerLabel?: ReactNode;
  'aria-label'?: string;
  onOpenChange?: (open: boolean) => void;
};

export function LocationMultiSelectDropdown({
  locations,
  selectedIds,
  onToggleLocation,
  onMasterCheckboxChange,
  disabled = false,
  className = '',
  triggerLabel,
  'aria-label': ariaLabel = 'Select locations',
  onOpenChange,
}: Readonly<LocationMultiSelectDropdownProps>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const masterRef = useRef<HTMLInputElement>(null);

  const allSelected =
    locations.length > 0 && selectedIds.length === locations.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const displayLabel = formatLocationTriggerLabel(
    selectedIds,
    locations,
    locations.length,
  );

  useEffect(() => {
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only when open changes
  }, [open]);

  useEffect(() => {
    const el = masterRef.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected, open]);

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

  const handleMasterChange = () => {
    onMasterCheckboxChange();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        disabled={disabled}
        className={triggerBaseClass}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{triggerLabel ?? displayLabel}</span>
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
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable="true"
          className={`${listBaseClass} top-full mt-1`}
        >
          <label className="flex items-center gap-2 text-sm text-primary cursor-pointer py-2 px-3 hover:bg-gray-100 font-medium border-b border-gray-100">
            <input
              ref={masterRef}
              type="checkbox"
              className="rounded border-gray-300"
              checked={allSelected}
              onChange={handleMasterChange}
              aria-label="Select all locations"
            />
            <span>Select all</span>
          </label>
          {locations.map((loc) => (
            <label
              key={loc._id}
              role="option"
              aria-selected={selectedIds.includes(loc._id)}
              className="flex items-center gap-2 text-sm text-primary cursor-pointer py-2 px-3 hover:bg-gray-100"
            >
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={selectedIds.includes(loc._id)}
                onChange={() => onToggleLocation(loc._id)}
              />
              <span className="truncate">{loc.storeName}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
