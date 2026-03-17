import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trainingAssignmentService } from '../../services/trainingAssignment.service';
import { openDocumentProxyInNewTab, getDocumentProxyUrl } from '../../services/training.service';
import { getModuleDateRanges, type ModuleDateRange } from '../../utils/trainingProgressUtils';
import { getDocumentFormatFromApiModuleFile } from '../../utils/createTrainingModalHelpers';
import { DocumentTypeThumbnail } from './DocumentTypeThumbnail';
import { Spinner } from '../common/Spinner';
import type { AssignmentDetail } from '../../types/trainingReviews.types';
import ViewIcon from '@assets/icons/view.svg?react';

/** Image thumbnail for already-uploaded files (proxy URL). */
function UploadedImagePreview({ src }: Readonly<{ src: string }>) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="w-12 h-12 rounded border border-gray-200 flex-shrink-0 overflow-hidden bg-gray-100 relative">
      {!loaded && <div className="absolute inset-0 bg-gray-200 animate-pulse" aria-hidden />}
      <img
        src={src}
        alt=""
        className={`w-12 h-12 object-cover ${loaded ? 'relative z-10' : 'opacity-0 absolute inset-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format a UTC date-only Date for display (avoids timezone shift). */
function formatUtcDateOnly(d: Date): string {
  return d.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type ModuleDisplayStatus = 'completed_on_time' | 'completed_late' | 'in_progress' | 'not_started';

function getModuleDisplayStatusLabel(
  status: ModuleDisplayStatus,
  endDate: Date
): string {
  const now = new Date();
  const todayOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (status) {
    case 'completed_on_time':
      return 'Completed on time';
    case 'completed_late':
      return 'Completed late';
    case 'in_progress':
      return endDate.getTime() >= todayOnly.getTime() ? 'In progress (On track)' : 'In progress (Overdue)';
    case 'not_started':
      return 'Not started';
    default:
      return 'Not started';
  }
}

/** Tailwind text color class for status: positive (green), negative (red), pending (amber). */
function getModuleDisplayStatusColor(status: ModuleDisplayStatus): string {
  switch (status) {
    case 'completed_on_time':
      return 'text-positive';
    case 'completed_late':
      return 'text-negative';
    case 'in_progress':
      return 'text-pending';
    case 'not_started':
    default:
      return 'text-secondary';
  }
}

/** Duration taken in days (start to completedAt inclusive). */
function getDurationTakenDays(startDate: Date, completedAtIso: string): number {
  const end = new Date(completedAtIso);
  const startTime = startDate.getTime();
  const endTime = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())).getTime();
  const days = Math.round((endTime - startTime) / 86400000) + 1;
  return Math.max(1, days);
}

interface ModuleListItemProps {
  mod: AssignmentDetail['training']['modules'][number];
  progress: AssignmentDetail['moduleProgress'][number] | undefined;
  range: ModuleDateRange | undefined;
  showDates: boolean;
  onOpenFile: (publicId: string, resourceType: 'image' | 'raw', filename?: string) => void;
}

function getDisplayStatusFromProgress(
  range: ModuleDateRange | undefined,
  progress: AssignmentDetail['moduleProgress'][number] | undefined
): ModuleDisplayStatus {
  if (range) return range.status;
  if (progress?.status === 'completed') return 'completed_on_time';
  if (progress?.status === 'in_progress') return 'in_progress';
  return 'not_started';
}

function ModuleListItem({ mod, progress, range, showDates, onOpenFile }: Readonly<ModuleListItemProps>) {
  const displayStatus = getDisplayStatusFromProgress(range, progress);
  const statusLabelText = range
    ? getModuleDisplayStatusLabel(range.status, range.endDate)
    : (progress?.status ?? 'not_started');
  const statusColorClass = getModuleDisplayStatusColor(displayStatus);
  const durationSet = mod.duration ?? 1;
  const isCompleted = progress?.status === 'completed';
  const durationTaken =
    isCompleted && range && progress?.completedAt
      ? getDurationTakenDays(range.startDate, progress.completedAt)
      : null;

  return (
    <div className="rounded-lg p-0 space-y-4">
      <div className="flex justify-between items-start gap-2">
        <span className="text-primary text-sm font-medium">{mod.name}</span>
        <span className={`${statusColorClass} text-xs font-medium shrink-0`}>{statusLabelText}</span>
      </div>
      <p className="text-secondary text-xs">Duration (set): {durationSet} day{durationSet === 1 ? '' : 's'}</p>
      {durationTaken != null && (
        <p className="text-secondary text-xs">Duration taken: {durationTaken} day{durationTaken === 1 ? '' : 's'}</p>
      )}

      {showDates && range && (
        <p className="text-secondary text-xs">
          Start: {formatUtcDateOnly(range.startDate)} — End: {formatUtcDateOnly(range.endDate)}
        </p>
      )}
      {mod.moduleFiles?.length > 0 && (
        <div>
          <p className="text-xs text-secondary font-medium mb-1.5">Training documents</p>
          <ul className="space-y-1 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {mod.moduleFiles.map((f) => (
              <li key={f.publicId} className="flex items-center gap-2 px-3 py-1.5 min-w-0">
                {f.resourceType === 'image' ? (
                  <UploadedImagePreview src={getDocumentProxyUrl(f.publicId, 'image')} />
                ) : (
                  <DocumentTypeThumbnail format={getDocumentFormatFromApiModuleFile(f)} />
                )}
                <span className="text-sm text-primary truncate min-w-0 flex-1" title={f.filename ?? 'File'}>
                  {f.filename ?? 'View file'}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenFile(f.publicId, f.resourceType, f.filename ?? undefined)}
                  className="p-1 text-primary hover:bg-gray-100 rounded shrink-0"
                  aria-label="View file"
                  title="View file"
                >
                  <ViewIcon className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {progress?.managerNotes && (
        <p className="text-secondary text-xs border-t border-gray-100 pt-3">
          <span className="font-medium text-primary">Manager notes:</span> {progress.managerNotes}
        </p>
      )}
      {(progress?.extraFiles?.length ?? 0) > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-secondary font-medium mb-1.5">Documents uploaded by manager</p>
          <ul className="space-y-1 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {(progress?.extraFiles ?? []).map((f, i) => (
              <li
                key={`${f.publicId}-${i}`}
                className="flex items-center gap-2 px-3 py-1.5 min-w-0"
              >
                {f.resourceType === 'image' ? (
                  <UploadedImagePreview src={getDocumentProxyUrl(f.publicId, 'image')} />
                ) : (
                  <DocumentTypeThumbnail format={getDocumentFormatFromApiModuleFile(f)} />
                )}
                <span className="text-sm text-primary truncate min-w-0 flex-1" title={f.filename ?? 'File'}>
                  {f.filename ?? 'View file'}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenFile(f.publicId, f.resourceType, f.filename)}
                  className="p-1 text-primary hover:bg-gray-100 rounded shrink-0"
                  aria-label="View file"
                  title="View file"
                >
                  <ViewIcon className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export interface EmployeeTrainingViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: string | null;
}

export const EmployeeTrainingViewModal = ({
  isOpen,
  onClose,
  assignmentId,
}: EmployeeTrainingViewModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [modulesExpanded, setModulesExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && assignmentId) {
      setLoading(true);
      setDetail(null);
      trainingAssignmentService
        .getAssignmentById(assignmentId)
        .then(setDetail)
        .finally(() => setLoading(false));
    } else if (!isOpen) {
      setDetail(null);
    }
  }, [isOpen, assignmentId]);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  const handleOpenFile = (publicId: string, resourceType: 'image' | 'raw', filename?: string) => {
    openDocumentProxyInNewTab(publicId, resourceType, filename).catch(() => { });
  };

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="view-assignment-modal-title"
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-2xl">
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
            <h2 id="view-assignment-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Training Assignment
            </h2>
          </div>
          <div className="flex-1 min-h-0 min-w-0 flex flex-col px-5 py-4 overflow-y-auto border-x border-gray-200">
            {loading && !detail && (
              <div className="flex flex-1 min-h-[12rem] justify-center items-center">
                <Spinner size="lg" className="text-button-primary" />
              </div>
            )}
            {!loading && !detail && assignmentId && (
              <p className="text-secondary text-sm">Assignment not found.</p>
            )}
            {detail && (() => {
              const moduleDurations = detail.training.modules?.map((m) => m.duration ?? 1) ?? [];
              const moduleProgress = detail.moduleProgress?.map((p) => ({
                completedAt: p.completedAt,
                status: p.status,
              })) ?? [];
              const dateRanges = getModuleDateRanges(detail.assignedAt, moduleDurations, moduleProgress);
              const allComplete =
                detail.moduleProgress?.length === detail.training.modules?.length &&
                detail.moduleProgress?.every((p) => p.status === 'completed');
              const lastCompletedAt = detail.moduleProgress?.at(-1)?.completedAt;
              let endDateLabel: string;
              if (allComplete && lastCompletedAt) endDateLabel = formatDateOnly(lastCompletedAt);
              else if (allComplete) endDateLabel = '—';
              else endDateLabel = 'In progress';
              return (
                <>
                  <section className="mb-4">
                    <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Employee</h3>
                    <p className="text-primary text-sm">{detail.user.name}</p>
                    <p className="text-secondary text-xs">{detail.user.email}</p>
                    <p className="text-secondary text-xs">Role: {detail.user.role}</p>
                  </section>
                  <section className="mb-4">
                    <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Training</h3>
                    <p className="text-primary text-sm font-medium">{detail.training.name}</p>
                    <p className="text-secondary text-xs">
                      Start date: {detail.assignedAt ? formatDateOnly(detail.assignedAt) : '—'}
                    </p>
                    <p className="text-secondary text-xs">End date: {endDateLabel}</p>
                  </section>
                  <section>
                    <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Modules</h3>
                    <ul className="space-y-3">
                      {(() => {
                        const firstIncomplete = detail.moduleProgress?.findIndex((p) => p.status !== 'completed') ?? 0;
                        const currentModuleIndex =
                          firstIncomplete >= 0 ? firstIncomplete : Math.max(0, detail.training.modules.length - 1);
                        const defaultExpandedIndex = currentModuleIndex;
                        return detail.training.modules.map((mod, idx) => {
                          const canExpand = idx <= currentModuleIndex;
                          const hasExplicit = Object.keys(modulesExpanded).length > 0;
                          const isExpanded = canExpand && (hasExplicit ? modulesExpanded[idx] !== false : idx === defaultExpandedIndex);
                          const headerLabel = mod.name?.trim() ? `Module ${idx + 1} – ${mod.name.trim()}` : `Module ${idx + 1}`;
                          const previousCompleted = idx === 0 || detail.moduleProgress?.[idx - 1]?.status === 'completed';
                          return (
                            <li key={`${mod.name}-${idx}`} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                              {canExpand ? (
                                <button
                                  type="button"
                                  onClick={() => setModulesExpanded((p) => ({ ...p, [idx]: !isExpanded }))}
                                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-primary hover:bg-gray-100/80 transition-colors"
                                >
                                  <span>{headerLabel}</span>
                                  <span className="text-gray-500 shrink-0" aria-hidden>
                                    {isExpanded ? '▼' : '▶'}
                                  </span>
                                </button>
                              ) : (
                                <div
                                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-gray-400 cursor-not-allowed select-none"
                                  aria-disabled="true"
                                >
                                  <span>{headerLabel}</span>
                                  <span className="shrink-0" aria-hidden>▶</span>
                                </div>
                              )}
                              {isExpanded && (
                                <div className="border-t border-gray-200 p-4 bg-gray-50/50">
                                  <ModuleListItem
                                    mod={mod}
                                    progress={detail.moduleProgress?.[idx]}
                                    range={dateRanges[idx]}
                                    showDates={previousCompleted}
                                    onOpenFile={handleOpenFile}
                                  />
                                </div>
                              )}
                            </li>
                          );
                        });
                      })()}
                    </ul>
                  </section>
                </>
              );
            })()}
            <div className="mt-4 flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  dialogRef.current?.close();
                  onClose();
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-primary text-sm font-medium hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>,
    document.body
  );
};
