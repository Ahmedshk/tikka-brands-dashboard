import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { Spinner } from '../../components/common/Spinner';
import { LocationModal } from '../../components/modal/LocationModal';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import { LocationManagementSortableList } from '../../components/LocationManagement/LocationManagementSortableList';
import { locationService, invalidateLocationListCache } from '../../services/location.service';
import {
  locationGroupService,
  invalidateLocationGroupListCache,
} from '../../services/locationGroup.service';
import { LocationGroupManager, applyGroupFormSubmission } from '../../components/LocationManagement/LocationGroupManager';
import { LocationGroupModal } from '../../components/modal/LocationGroupModal';
import type { Location, LocationGroup, LocationListItem } from '../../types';
import { locationOrderKey } from '../../utils/locationOrderHelpers';
import AdminAndSettingsIcon from '@assets/icons/admin_and_settings.svg?react';
import AddIcon from '@assets/icons/add.svg?react';

type Tab = 'locations' | 'groups';

export const LocationManagement = () => {
  const [tab, setTab] = useState<Tab>('locations');
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [groups, setGroups] = useState<LocationGroup[]>([]);
  const [savedOrderKey, setSavedOrderKey] = useState('');
  const [savedGroupOrderKey, setSavedGroupOrderKey] = useState('');
  const [savingGroupOrder, setSavingGroupOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [locationToDelete, setLocationToDelete] = useState<LocationListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Group modal state lives on the page so the header "Add Group" button and the
  // Groups tab can share one modal.
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editGroupForModal, setEditGroupForModal] = useState<LocationGroup | null>(null);

  const currentOrderKey = locationOrderKey(locations.map((l) => l._id));
  const orderDirty = locations.length > 0 && currentOrderKey !== savedOrderKey;

  // Group order drives the header dropdown's group sequence, tracked separately
  // so a dirty drag on one tab never marks the other tab's Save order button.
  const currentGroupOrderKey = locationOrderKey(groups.map((g) => g._id));
  const groupOrderDirty =
    groups.length > 0 && currentGroupOrderKey !== savedGroupOrderKey;

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

  const fetchGroups = useCallback(async () => {
    try {
      // Unfiltered management list: the navbar endpoint omits groups with no
      // accessible members, which would hide a brand-new group entirely.
      const data = await locationGroupService.getAllForManagement({ bustCache: true });
      setGroups(data);
      setSavedGroupOrderKey(locationOrderKey(data.map((g) => g._id)));
    } catch {
      // Grouping is additive: a failure here must not break the locations tab.
      setGroups([]);
      setSavedGroupOrderKey('');
    }
  }, []);

  // Refresh both: membership changes the locations tab's per-row picker, and
  // group CRUD changes what the header selector can bucket.
  const refreshAll = useCallback(async () => {
    invalidateLocationListCache();
    invalidateLocationGroupListCache();
    await Promise.all([fetchLocations(), fetchGroups()]);
  }, [fetchLocations, fetchGroups]);

  useEffect(() => {
    fetchLocations();
    fetchGroups();
  }, [fetchLocations, fetchGroups]);

  // Guard unsaved drags on either tab.
  useEffect(() => {
    if (!orderDirty && !groupOrderDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [orderDirty, groupOrderDirty]);

  const openAddModal = () => {
    setEditLocation(null);
    setModalOpen(true);
  };

  /**
   * The Groups tab has its own Add Group button in the page header, so the modal
   * and its submit handler are hoisted here and shared with the tab body. The
   * tab body receives `onRequestCreate` to open it.
   */
  const openAddGroupModal = () => {
    setEditGroupForModal(null);
    setGroupModalOpen(true);
  };

  const handleGroupSubmit = async (name: string, locationIds: string[]) => {
    await applyGroupFormSubmission({ editGroup: editGroupForModal, name, locationIds });
    await refreshAll();
    toast.success(editGroupForModal == null ? 'Location group created.' : 'Location group updated.');
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
      setLocationToDelete(null);
      // A deleted location leaves its group, so refresh both catalogs.
      await refreshAll();
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

  const handleSaveGroupOrder = async () => {
    if (!groupOrderDirty) return;
    setSavingGroupOrder(true);
    try {
      // Server validates that every group appears exactly once, so send the
      // full ordered id list rather than a diff.
      const ids = groups.map((g) => g._id);
      await locationGroupService.reorder(ids);
      setSavedGroupOrderKey(locationOrderKey(ids));
      invalidateLocationGroupListCache();
      toast.success('Group order saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save group order.');
    } finally {
      setSavingGroupOrder(false);
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
            {tab === 'locations' && orderDirty ? (
              <button
                type="button"
                onClick={handleSaveOrder}
                disabled={savingOrder}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingOrder ? 'Saving…' : 'Save order'}
              </button>
            ) : null}
            {/* One action button at a time in the header, mirroring Add Location. */}
            {tab === 'groups' ? (
              <>
                {groupOrderDirty ? (
                  <button
                    type="button"
                    onClick={handleSaveGroupOrder}
                    disabled={savingGroupOrder}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {savingGroupOrder ? 'Saving…' : 'Save order'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={openAddGroupModal}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer"
                  title="Add new location group"
                >
                  <AddIcon className="w-4 h-4" />
                  Add Group
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={openAddModal}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer"
                title="Add new location"
              >
                <AddIcon className="w-4 h-4" />
                Add Location
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1 mb-4 border-b border-gray-200" role="tablist" aria-label="Location management sections">
          {(['locations', 'groups'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs md:text-sm 2xl:text-base font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-button-primary text-button-primary'
                  : 'border-transparent text-secondary hover:text-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="bg-card-background rounded-xl shadow border border-gray-200 overflow-hidden">
          {tab === 'groups' ? (
            // No padding wrapper: the table should sit flush in the card, same
            // as the locations list.
            <LocationGroupManager
              groups={groups}
              locations={locations}
              onReorder={setGroups}
              onRequestEdit={(g) => {
                setEditGroupForModal(g);
                setGroupModalOpen(true);
              }}
              onChanged={refreshAll}
            />
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      <LocationGroupModal
        isOpen={groupModalOpen}
        onClose={() => {
          setGroupModalOpen(false);
          setEditGroupForModal(null);
        }}
        editGroup={editGroupForModal}
        locations={locations}
        onSubmit={handleGroupSubmit}
      />

      <LocationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          invalidateLocationListCache();
          fetchLocations();
          fetchGroups();
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
