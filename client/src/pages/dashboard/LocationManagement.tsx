import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../../components/common/Layout';
import { Pagination } from '../../components/common/Pagination';
import { Spinner } from '../../components/common/Spinner';
import { LocationModal } from '../../components/modal/LocationModal';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import { locationService, invalidateLocationListCache } from '../../services/location.service';
import type { Location, LocationListItem } from '../../types';
import { CiImageOn } from 'react-icons/ci';
import AdminAndSettingsIcon from '@assets/icons/admin_and_settings.svg?react';
import AddIcon from '@assets/icons/add.svg?react';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';

const PAGE_SIZE = 10;

export const LocationManagement = () => {
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [locationToDelete, setLocationToDelete] = useState<LocationListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  const fetchLocations = useCallback(async (pageOverride?: number) => {
    const p = pageOverride ?? page;
    setLoading(true);
    try {
      const data = await locationService.getPaginated(p, PAGE_SIZE);
      setLocations(data.locations);
      setTotal(data.total);
      if (data.locations.length === 0 && p > 1) {
        setPage(1);
        const dataFirst = await locationService.getPaginated(1, PAGE_SIZE);
        setLocations(dataFirst.locations);
        setTotal(dataFirst.total);
      } else {
        setPage(p);
      }
    } catch {
      setLocations([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

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

  const handlePageChange = (newPage: number) => setPage(newPage);

  return (
    <Layout>
      <div className="p-6">
        {/* Page header - outside white container */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminAndSettingsIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Location Management
          </h2>
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

        {/* White container - cards on mobile, table on md+ */}
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
            <>
              {/* Mobile: card list */}
              <div className="md:hidden divide-y divide-gray-200">
                {locations.map((loc, index) => {
                  const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                  return (
                    <div
                      key={loc._id}
                      className={`${cardBg} px-4 py-4 sm:px-5 sm:py-4 flex flex-col gap-3`}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-primary truncate" title={loc.storeName}>
                          <span className="w-8 h-8 flex items-center justify-center shrink-0 text-gray-400">
                            {loc.logoUrl ? (
                              <img src={loc.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain" />
                            ) : (
                              <CiImageOn className="w-5 h-5" aria-hidden />
                            )}
                          </span>
                          <span className="truncate">{loc.storeName}</span>
                        </p>
                        {loc.address ? (
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2" title={loc.address}>
                            {loc.address}
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-600 mt-1" title={loc.timezone}>
                          <span className="font-medium">Timezone:</span> {loc.timezone}
                        </p>
                        <p className="text-xs text-gray-600">
                          <span className="font-medium">Business start:</span> {loc.businessStartTime}
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-0 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(loc)}
                          className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation"
                          aria-label={`Edit ${loc.storeName}`}
                          title={`Edit ${loc.storeName}`}
                        >
                          <EditIcon className="w-4 h-4 text-primary" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm(loc)}
                          className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation"
                          aria-label={`Delete ${loc.storeName}`}
                          title={`Delete ${loc.storeName}`}
                        >
                          <DeleteIcon className="w-4 h-4 text-primary" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full table-fixed min-w-[40rem]">
                  <thead>
                    <tr className="bg-button-primary text-white">
                      <th className="w-[20%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Store name</th>
                      <th className="w-[35%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Address</th>
                      <th className="w-[22%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Timezone</th>
                      <th className="w-[13%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Business start time</th>
                      <th className="text-right text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((loc, index) => {
                      const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                      return (
                        <tr key={loc._id} className={rowBg}>
                          <td className="px-4 lg:px-6 py-3 lg:py-4">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-8 h-8 flex items-center justify-center shrink-0 text-gray-400">
                                {loc.logoUrl ? (
                                  <img src={loc.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain" />
                                ) : (
                                  <CiImageOn className="w-5 h-5" aria-hidden />
                                )}
                              </span>
                              <span className="text-xs 2xl:text-sm text-primary truncate" title={loc.storeName}>
                                {loc.storeName}
                              </span>
                            </div>
                          </td>
                          <td
                            className="px-4 lg:px-6 py-3 lg:py-4 text-xs 2xl:text-sm text-primary truncate"
                            title={loc.address}
                          >
                            {loc.address}
                          </td>
                          <td
                            className="px-4 lg:px-6 py-3 lg:py-4 text-xs 2xl:text-sm text-primary truncate"
                            title={loc.timezone}
                          >
                            {loc.timezone}
                          </td>
                          <td className="px-4 lg:px-6 py-3 lg:py-4 text-xs 2xl:text-sm text-primary whitespace-nowrap">
                            {loc.businessStartTime}
                          </td>
                          <td className="px-4 lg:px-6 py-3 lg:py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditModal(loc)}
                                className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                                aria-label={`Edit ${loc.storeName}`}
                                title={`Edit ${loc.storeName}`}
                              >
                                <EditIcon className="w-4 h-4 text-primary" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteConfirm(loc)}
                                className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                                aria-label={`Delete ${loc.storeName}`}
                                title={`Delete ${loc.storeName}`}
                              >
                                <DeleteIcon className="w-4 h-4 text-primary" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  totalItems={total}
                  pageSize={PAGE_SIZE}
                  onPageChange={handlePageChange}
                />
              )}
            </>
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
