import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Spinner } from '../common/Spinner';
import { CiImageOn } from 'react-icons/ci';
import type { LocationGroup, LocationListItem } from '../../types';

export interface LocationGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Null for create, the group being edited otherwise. */
  editGroup: LocationGroup | null;
  /** All locations, for the membership checkboxes. */
  locations: LocationListItem[];
  /** Called with the group name and the chosen member ids. */
  onSubmit: (name: string, locationIds: string[]) => Promise<void>;
}

/**
 * Create / edit a location group: a name plus a checkbox list of locations.
 *
 * Checkboxes edit only this group's membership. A location's memberships in
 * other groups are preserved when it is checked or unchecked here.
 */
export function LocationGroupModal({
  isOpen,
  onClose,
  editGroup,
  locations,
  onSubmit,
}: Readonly<LocationGroupModalProps>) {
  const isEdit = editGroup != null;
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Mounted only while open (see the early return below), so the element is
  // always fresh and showModal() is the only transition needed. Closing unmounts
  // it, which is why the close paths below also call onClose().
  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, []);

  // Reset the form from props each time the modal opens so a stale draft from a
  // previously edited group can never leak into this one.
  useEffect(() => {
    if (!isOpen) return;
    setName(editGroup?.name ?? '');
    setSelectedIds(editGroup?.locationIds ?? []);
    setError('');
  }, [isOpen, editGroup]);

  const allSelected = locations.length > 0 && selectedIds.length === locations.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const canSubmit = name.trim().length > 0 && !submitting;

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleLocation = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(locations.map((l) => l._id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(name.trim(), selectedIds);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Single exit for Cancel, the × button, and Escape.
   *
   * `el.close()` fires the dialog's native close event, which re-enters this
   * function through the `onClose` prop; the guard means the parent is notified
   * exactly once whichever path was taken.
   */
  const close = () => {
    const el = dialogRef.current;
    // `el.close()` re-enters here via the dialog's onClose handler, so only
    // notify the parent from the outermost call.
    if (el?.open) el.close();
    else onClose();
  };

  // Match LocationModal: never render the <dialog> unless it is open. Without
  // this the `grid` class below lays out a dialog that was never showModal()'d,
  // and `close()` on a non-open dialog is a no-op — the panel sticks forever.
  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      // Fires for Escape and for the element's own close(). Route it through
      // close() so the parent is notified exactly once whichever path is taken.
      onClose={close}
      className="modal-full-viewport z-[300] m-0 grid place-items-center border-0 bg-transparent p-4 outline-none [&::backdrop]:bg-black/50"
      aria-labelledby="location-group-modal-title"
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-2xl">
        <button
          type="button"
          onClick={close}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2
              id="location-group-modal-title"
              className="text-sm md:text-base 2xl:text-lg font-semibold text-white"
            >
              {isEdit ? 'Edit Location Group' : 'Add Location Group'}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 border-x border-gray-200">
              {error ? (
                <p className="text-sm text-negative" role="alert">
                  {error}
                </p>
              ) : null}

              <div>
                <label
                  htmlFor="location-group-name"
                  className="block text-xs font-medium text-primary mb-1"
                >
                  Group name
                </label>
                <input
                  id="location-group-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. West Coast"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-primary bg-white focus:outline-none focus:ring-2 focus:ring-gray-300/50"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-primary">
                    Locations in this group
                  </span>
                  {locations.length > 0 ? (
                    <span className="text-xs text-secondary">
                      {selectedIds.length} of {locations.length} selected
                    </span>
                  ) : null}
                </div>
                {locations.length === 0 ? (
                  <p className="text-sm text-secondary py-3">
                    No locations available yet. Add a location first.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto dropdown-list-scrollbar border border-gray-200 rounded-lg">
                    <label className="flex items-center gap-2 px-3 py-2 text-sm text-primary cursor-pointer hover:bg-gray-100 font-medium bg-gray-50 border-b border-gray-100 sticky top-0">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleAll}
                      />
                      <span>Select all</span>
                    </label>
                    {locations.map((loc) => (
                      <label
                        key={loc._id}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-primary cursor-pointer hover:bg-gray-100"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={selectedSet.has(loc._id)}
                          onChange={() => toggleLocation(loc._id)}
                        />
                        {loc.logoUrl ? (
                          <img src={loc.logoUrl} alt="" className="w-5 h-5 rounded object-contain" />
                        ) : (
                          <CiImageOn className="w-4 h-4 text-gray-400" aria-hidden />
                        )}
                        <span className="truncate">{loc.storeName}</span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-secondary mt-2">
                  Locations can belong to multiple groups. These selections apply
                  only to this group.
                </p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex flex-wrap justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 rounded-lg border border-gray-300 text-primary hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-2 rounded-lg bg-button-primary text-white font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                title={isEdit ? 'Update group' : 'Create group'}
              >
                {submitting ? (
                  <>
                    <Spinner size="sm" className="h-4 w-4 text-white" />
                    {isEdit ? 'Updating...' : 'Creating...'}
                  </>
                ) : isEdit ? (
                  'Update'
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
