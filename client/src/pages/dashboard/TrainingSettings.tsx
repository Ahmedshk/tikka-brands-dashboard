import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { TrainingsCard } from '../../components/TrainingReviews';
import { CreateTrainingModal } from '../../components/modal/CreateTrainingModal';
import { EditTrainingModal } from '../../components/modal/EditTrainingModal';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import { trainingService } from '../../services/training.service';
import type { Training } from '../../types/trainingReviews.types';
import AdminAndSettingsIcon from '@assets/icons/admin_and_settings.svg?react';
import AddIcon from '@assets/icons/add.svg?react';
import { useCanAccessComponent } from '../../hooks/useCanAccessComponent';

const PAGE_ID = 'training-settings';
const PAGE_SIZE = 10;

export const TrainingSettings = () => {
  const [page, setPage] = useState(1);
  const [createTrainingModalOpen, setCreateTrainingModalOpen] = useState(false);
  const [editTrainingId, setEditTrainingId] = useState<string | null>(null);
  const [trainingToDelete, setTrainingToDelete] = useState<Training | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [trainingsLoading, setTrainingsLoading] = useState(true);

  const canFullPage = useCanAccessComponent(PAGE_ID, 'full-page');
  const canTrainings = useCanAccessComponent(PAGE_ID, 'trainings');
  const showCatalog = canFullPage || canTrainings;

  const refreshTrainings = useCallback(() => {
    setTrainingsLoading(true);
    trainingService
      .list()
      .then(setTrainings)
      .catch(() => {
        toast.error('Failed to load trainings');
        setTrainings([]);
      })
      .finally(() => setTrainingsLoading(false));
  }, []);

  useEffect(() => {
    if (!showCatalog) {
      setTrainingsLoading(false);
      return;
    }
    refreshTrainings();
  }, [showCatalog, refreshTrainings]);

  const totalItems = trainings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const paginatedTrainings = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return trainings.slice(start, start + PAGE_SIZE);
  }, [trainings, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <Layout>
      <div className="p-6 flex flex-col min-h-full">
        <div className="mb-6 flex-shrink-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
            <AdminAndSettingsIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
            Training Settings
          </h2>
          {showCatalog && (
            <button
              type="button"
              onClick={() => setCreateTrainingModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer shrink-0 self-start sm:self-auto"
              title="Create training"
            >
              <AddIcon className="w-4 h-4" aria-hidden />
              Create
            </button>
          )}
        </div>

        {showCatalog ? (
          <div className="flex-1 min-h-0 flex flex-col w-full max-w-full">
            <TrainingsCard
              trainings={paginatedTrainings}
              loading={trainingsLoading}
              onEdit={(training) => setEditTrainingId(training.id)}
              onDelete={(training) => setTrainingToDelete(training)}
              pagination={{
                currentPage: page,
                totalPages,
                totalItems,
                pageSize: PAGE_SIZE,
                onPageChange: setPage,
              }}
            />
          </div>
        ) : (
          <p className="text-secondary text-sm">You do not have access to training catalog settings.</p>
        )}
      </div>

      <CreateTrainingModal
        isOpen={createTrainingModalOpen}
        onClose={() => setCreateTrainingModalOpen(false)}
        onCreated={() => {
          setCreateTrainingModalOpen(false);
          refreshTrainings();
        }}
      />
      <EditTrainingModal
        trainingId={editTrainingId}
        isOpen={editTrainingId != null}
        onClose={() => setEditTrainingId(null)}
        onUpdated={() => {
          setEditTrainingId(null);
          refreshTrainings();
        }}
      />
      <ConfirmDialog
        isOpen={trainingToDelete != null}
        onClose={() => setTrainingToDelete(null)}
        title="Delete training"
        message={
          trainingToDelete
            ? `Delete training "${trainingToDelete.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
        onConfirm={async () => {
          if (!trainingToDelete) return;
          setDeleting(true);
          try {
            await trainingService.delete(trainingToDelete.id);
            setTrainingToDelete(null);
            refreshTrainings();
          } finally {
            setDeleting(false);
          }
        }}
      />
    </Layout>
  );
};
