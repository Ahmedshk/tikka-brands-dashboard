import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { userService, type SyncFromHomebaseResult } from '../../services/user.service';
import { locationService } from '../../services/location.service';
import type { LocationListItem } from '../../types';

export interface SyncHomebaseModalProps {
  open: boolean;
  onClose: () => void;
  onSynced: (result: SyncFromHomebaseResult) => void;
  onError?: (message: string) => void;
}

export function SyncHomebaseModal({ open, onClose, onSynced, onError }: Readonly<SyncHomebaseModalProps>) {
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedLocationId('');
    locationService.getAll().then(setLocations).catch(() => setLocations([]));
  }, [open]);

  const handleSync = async () => {
    if (!selectedLocationId.trim()) {
      onError?.('Please select a location.');
      return;
    }
    setSyncing(true);
    try {
      const result = await userService.syncFromHomebase(selectedLocationId.trim());
      onSynced(result);
      onClose();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to sync from Homebase');
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
      aria-labelledby="sync-homebase-title"
    >
      <button
        type="button"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div className="relative bg-card-background rounded-xl shadow-lg border border-gray-200 w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 id="sync-homebase-title" className="text-lg font-semibold text-primary">
            Sync from Homebase
          </h2>
          <p className="text-sm text-secondary mt-1">
            Select a location to import employees from Homebase. Existing users (matched by Homebase ID or email) will be updated.
          </p>
        </div>
        <div className="px-6 py-4">
          <label htmlFor="sync-homebase-location" className="block text-sm font-medium text-primary mb-1">
            Location
          </label>
          <select
            id="sync-homebase-location"
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
