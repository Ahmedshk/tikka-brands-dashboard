import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trainingService } from '../../services/training.service';
import { userService } from '../../services/user.service';
import { trainingAssignmentService } from '../../services/trainingAssignment.service';
import { Spinner } from '../common/Spinner';
import type { Training } from '../../types/trainingReviews.types';
import type { UserRow } from '../../types/userManagement.types';

export interface AssignTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Navbar-selected location ID; required to load employees. */
  locationId: string | null;
  /** Role IDs the current user can assign to (hierarchy: self + descendants). Only users with these roles are shown. */
  allowedRoleIds?: Set<string>;
  /** True while hierarchy is loading; used to show loading message when no employees yet. */
  hierarchyLoading?: boolean;
  onAssigned?: () => void;
}

type Step = 'training' | 'employees';

export const AssignTrainingModal = ({
  isOpen,
  onClose,
  locationId,
  allowedRoleIds = new Set(),
  hierarchyLoading = false,
  onAssigned,
}: AssignTrainingModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>('training');
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [employees, setEmployees] = useState<UserRow[]>([]);
  const [loadingTrainings, setLoadingTrainings] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selectedTrainingId, setSelectedTrainingId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
      setStep('training');
      setSelectedTrainingId(null);
      setSelectedUserIds(new Set());
      setError('');
      setLoadingTrainings(true);
      trainingService
        .list()
        .then(setTrainings)
        .catch(() => setTrainings([]))
        .finally(() => setLoadingTrainings(false));
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && step === 'employees' && locationId) {
      setLoadingEmployees(true);
      userService
        .listUsers({ locationId, pageSize: 100 })
        .then((res) => {
          const list = res.users;
          if (allowedRoleIds.size === 0) {
            setEmployees([]);
            return;
          }
          setEmployees(list.filter((u) => u.roleId != null && allowedRoleIds.has(u.roleId)));
        })
        .catch(() => setEmployees([]))
        .finally(() => setLoadingEmployees(false));
    }
  }, [isOpen, step, locationId, allowedRoleIds]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleNext = () => {
    if (step === 'training') {
      if (!selectedTrainingId) {
        setError('Select a training.');
        return;
      }
      setError('');
      setStep('employees');
    }
  };

  const handleBack = () => {
    setError('');
    setStep('training');
  };

  const handleSubmit = async () => {
    if (!selectedTrainingId) return;
    if (selectedUserIds.size === 0) {
      setError('Select at least one employee.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await trainingAssignmentService.createAssignments(
        selectedTrainingId,
        Array.from(selectedUserIds)
      );
      onAssigned?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign training.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = (u: UserRow) =>
    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name || u.email || '—';

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="assign-training-modal-title"
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-lg">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 hover:ring-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 id="assign-training-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Assign Training
            </h2>
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col px-5 py-4 overflow-hidden overflow-y-auto border-x border-gray-200">
            {step === 'training' && (
              <>
                {!loadingTrainings && (
                  <p className="text-secondary text-xs md:text-sm mb-3">Select a training to assign.</p>
                )}
                {loadingTrainings ? (
                  <div className="flex flex-1 min-h-[12rem] justify-center items-center">
                    <Spinner size="lg" className="text-button-primary" />
                  </div>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {trainings.map((t) => (
                      <li key={t.id}>
                        <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-100">
                          <input
                            type="radio"
                            name="training"
                            checked={selectedTrainingId === t.id}
                            onChange={() => setSelectedTrainingId(t.id)}
                            className="rounded-full"
                          />
                          <span className="text-primary text-sm md:text-base">
                            {t.name}
                          </span>
                          <span className="text-secondary text-xs">
                            ({t.moduleCount} module{t.moduleCount === 1 ? '' : 's'}
                            {t.durationDays != null && `, ${t.durationDays} day${t.durationDays === 1 ? '' : 's'}`})
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {step === 'employees' && (
              <>
                {locationId ? (
                  <>
                    {!(loadingEmployees || (hierarchyLoading && allowedRoleIds.size === 0)) && (
                      <p className="text-secondary text-xs md:text-sm mb-3">Select employees to assign this training to.</p>
                    )}
                    {(() => {
                      if (loadingEmployees || (hierarchyLoading && allowedRoleIds.size === 0)) {
                        return (
                          <div className="flex flex-1 min-h-[12rem] justify-center items-center">
                            <Spinner size="lg" className="text-button-primary" />
                          </div>
                        );
                      }
                      if (allowedRoleIds.size === 0) return <p className="text-secondary text-sm">You can only assign training to users who report to your role. No eligible employees.</p>;
                      if (employees.length === 0) return <p className="text-secondary text-sm">No employees in your hierarchy at this location.</p>;
                      return (
                        <ul className="space-y-1 max-h-56 overflow-y-auto">
                          {employees.map((u) => (
                            <li key={u._id}>
                              <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-100">
                                <input
                                  type="checkbox"
                                  checked={selectedUserIds.has(u._id)}
                                  onChange={() => toggleUser(u._id)}
                                />
                                <span className="text-primary text-sm">{displayName(u)}</span>
                                <span className="text-secondary text-xs">({u.role ?? '—'})</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      );
                    })()}
                  </>
                ) : (
                  <p className="text-secondary text-sm">Select a location in the navbar to see employees.</p>
                )}
              </>
            )}
            {error && (
              <p className="mt-2 text-negative text-sm" role="alert">
                {error}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2 justify-end flex-shrink-0">
              {step === 'employees' ? (
                <>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-primary text-sm font-medium hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || !locationId || selectedUserIds.size === 0}
                    className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting ? 'Assigning…' : 'Assign'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!selectedTrainingId}
                  className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </dialog>,
    document.body
  );
};
