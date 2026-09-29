import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LocationGroup, LocationListItem } from '../../types';
import { formatLocationTriggerLabel } from '../../utils/locationSelectionHelpers';
// `groups` is optional so the pre-grouping markup and behaviour are unchanged
// for callers that do not pass it.
import {
  bucketLocationsByGroup,
  groupCheckboxState,
  type LocationGroupBucket,
} from '../../utils/locationGroupHelpers';
import { PortalMenu } from './PortalMenu';

const triggerBaseClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-primary bg-white focus:outline-none focus:ring-2 focus:ring-gray-300/50 min-w-0 text-left flex items-center justify-between gap-2 disabled:opacity-70 disabled:cursor-not-allowed';
const listClass =
  'min-w-0 max-h-48 overflow-y-auto dropdown-list-scrollbar bg-white border border-gray-300 rounded-lg shadow-lg py-1';

/** Label for the bucket holding locations that are in no (visible) group. */
const UNGROUPED_LABEL = 'Ungrouped';

export type LocationMultiSelectDropdownProps = {
  locations: LocationListItem[];
  selectedIds: string[];
  onToggleLocation: (id: string) => void;
  onMasterCheckboxChange: () => void;
  /**
   * Groups whose members the user can see. Bucketing is derived here rather than
   * passed in so the list can never disagree with the checkbox states rendered
   * beside it.
   */
  groups?: LocationGroup[];
  /** Toggle every member of a group. Receives the group's visible member ids. */
  onToggleGroup?: (memberIds: string[]) => void;
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
  groups,
  onToggleGroup,
  disabled = false,
  className = '',
  triggerLabel,
  'aria-label': ariaLabel = 'Select locations',
  onOpenChange,
}: Readonly<LocationMultiSelectDropdownProps>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const masterRef = useRef<HTMLInputElement>(null);
  const groupRefs = useRef(new Map<string, HTMLInputElement>());

  const allSelected =
    locations.length > 0 && selectedIds.length === locations.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const { groups: buckets, ungrouped } = useMemo(
    () =>
      groups
        ? bucketLocationsByGroup(locations, groups)
        : { groups: [] as LocationGroupBucket[], ungrouped: locations },
    [locations, groups],
  );
  // Without groups every location sits in one flat list, matching the
  // pre-grouping markup exactly.
  const hasGroupSections = buckets.length > 0;

  const displayLabel = formatLocationTriggerLabel(
    selectedIds,
    locations,
    locations.length,
    buckets,
  );

  useEffect(() => {
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only when open changes
  }, [open]);

  useEffect(() => {
    const el = masterRef.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected, open]);

  // Tri-state for each group header. `indeterminate` is a DOM-only property, so
  // it has to be set imperatively rather than through the `checked` prop.
  useEffect(() => {
    for (const bucket of buckets) {
      const el = groupRefs.current.get(bucket.group._id);
      if (!el) continue;
      el.indeterminate = groupCheckboxState(selectedIds, bucket.locations.map((l) => l._id)) === 'indeterminate';
    }
  }, [buckets, selectedIds, open]);

  const handleMasterChange = () => {
    onMasterCheckboxChange();
  };

  const locationRowClass =
    'flex items-center gap-2 text-sm text-primary cursor-pointer py-2 px-3 hover:bg-gray-100';
  const groupHeaderRowClass =
    'flex items-center gap-2 text-sm text-primary cursor-pointer py-2 px-3 hover:bg-gray-100 bg-gray-50 font-semibold';

  const renderLocationRow = (loc: LocationListItem, indented: boolean) => (
    <label
      key={loc._id}
      role="option"
      aria-selected={selectedIds.includes(loc._id)}
      className={`${locationRowClass} ${indented ? 'pl-8' : ''}`}
    >
      <input
        type="checkbox"
        className="rounded border-gray-300"
        checked={selectedIds.includes(loc._id)}
        onChange={() => onToggleLocation(loc._id)}
      />
      <span className="truncate">{loc.storeName}</span>
    </label>
  );

  const renderUngroupedSection = () => {
    if (ungrouped.length === 0) return null;
    // Only a labelled header when there are real group sections above it.
    if (!hasGroupSections) return ungrouped.map((loc) => renderLocationRow(loc, false));
    return (
      <>
        <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 border-t border-gray-100 mt-1">
          {UNGROUPED_LABEL}
        </div>
        {ungrouped.map((loc) => renderLocationRow(loc, true))}
      </>
    );
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <PortalMenu
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        align="stretch"
        className={listClass}
        role="listbox"
        aria-label={ariaLabel}
      >
        <label
          className={`${locationRowClass} font-medium border-b border-gray-100`}
        >
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

        {buckets.map((bucket) => {
          const memberIds = bucket.locations.map((l) => l._id);
          const state = groupCheckboxState(selectedIds, memberIds);
          return (
            <div key={bucket.group._id}>
              <label className={groupHeaderRowClass}>
                <input
                  ref={(el) => {
                    if (el) groupRefs.current.set(bucket.group._id, el);
                    else groupRefs.current.delete(bucket.group._id);
                  }}
                  type="checkbox"
                  className="rounded border-gray-300"
                  checked={state === 'checked'}
                  aria-checked={state === 'indeterminate' ? 'mixed' : state === 'checked'}
                  aria-label={`Select all locations in ${bucket.group.name}`}
                  onChange={() => onToggleGroup?.(memberIds)}
                />
                <span className="truncate">{bucket.group.name}</span>
              </label>
              {bucket.locations.map((loc) => renderLocationRow(loc, true))}
            </div>
          );
        })}

        {renderUngroupedSection()}
      </PortalMenu>
    </div>
  );
}
