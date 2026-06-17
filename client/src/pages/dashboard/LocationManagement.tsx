import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import { LocationModal } from '../../components/modal/LocationModal';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import { LocationManagementSortableList } from '../../components/LocationManagement/LocationManagementSortableList';
import { locationService, invalidateLocationListCache } from '../../services/location.service';
import type { Location, LocationListItem } from '../../types';
import { locationOrderKey } from '../../utils/locationOrderHelpers';
import AdminAndSettingsIcon from '@assets/icons/admin_and_settings.svg?react';
import AddIcon from '@assets/icons/add.svg?react';

export const LocationManagement = () => {
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [savedOrderKey, setSavedOrderKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [locationToDelete, setLocationToDelete] = useState<LocationListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currentOrderKey = locationOrderKey(locations.map((l) => l._id));
  const orderDirty = locations.length > 0 && currentOrderKey !== savedOrderKey;

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await locationService.getAll({ bustCache: true });
      setLocations(data);
      setSavedOrderKey(locationOrderKey(data.map((l) => l._id)));
    } catch {
      setLocations([]);
      setSavedOrderKey('');
      toast.error('Failed to load locations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    if (!orderDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [orderDirty]);

  const openAddModal = () => {
    setEditLocation(null);
    setModalOpen(true);
  };

  const openEditModal = async (loc: LocationListItem) => {
    try {
      const full = await locationService.getById(loc._id);
      setEditLocation(full);
      setModalOpen(true);
    } catch {
      globalThis.alert('Failed to load location details.');
    }
  };

  const openDeleteConfirm = (loc: LocationListItem) => setLocationToDelete(loc);

  const handleConfirmDelete = async () => {
    if (!locationToDelete) return;
    setDeleting(true);
    try {
      await locationService.delete(locationToDelete._id);
      invalidateLocationListCache();
      setLocationToDelete(null);
      await fetchLocations();
    } catch (err) {
      globalThis.alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveOrder = async () => {
    if (!orderDirty) return;
    setSavingOrder(true);
    try {
      const ids = locations.map((l) => l._id);
      await locationService.reorderLocations(ids);
      setSavedOrderKey(locationOrderKey(ids));
      toast.success('Location order saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save location order.');
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminAndSettingsIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Location Management
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {orderDirty ? (
              <button
                type="button"
                onClick={handleSaveOrder}
                disabled={savingOrder}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingOrder ? 'Saving…' : 'Save order'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer"
              title="Add new location"
            >
              <AddIcon className="w-4 h-4" />
              Add Location
            </button>
          </div>
        </div>

        <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden">
          {loading && (
            <div className="p-8 flex flex-col items-center justify-center gap-3 text-primary">
              <Spinner size="lg" />
              <span>Loading...</span>
            </div>
          )}
          {!loading && locations.length === 0 && (
            <div className="p-8 text-center text-primary">No locations yet. Add one to get started.</div>
          )}
          {!loading && locations.length > 0 && (
            <LocationManagementSortableList
              locations={locations}
              onReorder={setLocations}
              onEdit={openEditModal}
              onDelete={openDeleteConfirm}
            />
          )}
        </div>
      </div>

      <LocationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          invalidateLocationListCache();
          fetchLocations();
        }}
        editLocation={editLocation}
      />

      {locationToDelete != null && (
        <ConfirmDialog
          isOpen
          onClose={() => setLocationToDelete(null)}
          title="Delete location"
          message={`Are you sure you want to delete "${locationToDelete.storeName}"? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleConfirmDelete}
          variant="danger"
          isLoading={deleting}
        />
      )}
    </Layout>
  );
};
