import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { userService, type SyncFromSquareResult } from '../../services/user.service';
import { locationService } from '../../services/location.service';
import type { LocationListItem } from '../../types';

export interface SyncSquareModalProps {
  open: boolean;
  onClose: () => void;
  onSynced: (result: SyncFromSquareResult) => void;
  onError?: (message: string) => void;
  /** When omitted, locations are loaded when the modal opens. */
  locations?: LocationListItem[];
}

export function SyncSquareModal({
  open,
  onClose,
  onSynced,
  onError,
  locations: locationsProp,
}: Readonly<SyncSquareModalProps>) {
  const [fetchedLocations, setFetchedLocations] = useState<LocationListItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const locations = locationsProp ?? fetchedLocations;

  useEffect(() => {
    if (!open) return;
    setSelectedLocationId('');
    if (locationsProp != null) return;
    locationService.getAll().then(setFetchedLocations).catch(() => setFetchedLocations([]));
  }, [open, locationsProp]);

  const handleSync = async () => {
    if (!selectedLocationId.trim()) {
      onError?.('Please select a location.');
      return;
    }
    setSyncing(true);
    try {
      const result = await userService.syncFromSquare(selectedLocationId.trim());
      onSynced(result);
      onClose();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to sync from Square');
    } finally {
      setSyncing(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <dialog
      open
      onCancel={onClose}
      className="modal-full-viewport z-50 flex items-center justify-center p-4 m-0 border-0 bg-black/50 backdrop:bg-black/50"
      aria-labelledby="sync-square-title"
    >
      <button
        type="button"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div className="relative bg-card-background rounded-xl shadow-lg border border-gray-200 w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 id="sync-square-title" className="text-lg font-semibold text-primary">
            Sync from Square
          </h2>
          <p className="text-sm text-secondary mt-1">
            Select a location to import active team members from Square. Existing users (matched by Square ID or email) will be updated.
          </p>
        </div>
        <div className="px-6 py-4">
          <label htmlFor="sync-location" className="block text-sm font-medium text-primary mb-1">
            Location
          </label>
          <select
            id="sync-location"
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-primary bg-white"
          >
            <option value="">Select location</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>
                {loc.storeName}
              </option>
            ))}
          </select>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-primary hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || !selectedLocationId.trim()}
            className="px-4 py-2 rounded-lg bg-button-primary text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Import'}
          </button>
        </div>
      </div>
    </dialog>,
    document.body
  );
}
