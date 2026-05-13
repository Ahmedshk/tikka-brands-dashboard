import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { trainingAssignmentService } from '../../services/trainingAssignment.service';
import { openDocumentProxyInNewTab } from '../../services/training.service';
import {
  getDocumentFormatFromApiModuleFile,
  getDocumentFormatFromFile,
  openFileInNewTab,
  TRAINING_DOCUMENT_ACCEPT,
  PENDING_LOCAL_FILE_ROW_CLASSNAME,
  PENDING_UPLOAD_TAG_CLASSNAME,
  SAVED_REMOTE_FILE_ROW_CLASSNAME,
} from '../../utils/createTrainingModalHelpers';
import { ProxiedImageThumbnail } from '../common/ProxiedImageThumbnail';
import { DocumentTypeThumbnail } from './DocumentTypeThumbnail';
import { Dropdown } from '../common/Dropdown';
import { Spinner } from '../common/Spinner';
import type {
  AssignmentDetail,
  AssignmentExtraFile,
  ModuleProgressEntry,
  UpdateAssignmentPayload,
} from '../../types/trainingReviews.types';
import ViewIcon from '@assets/icons/view.svg?react';
import UploadIcon from '@assets/icons/upload.svg?react';

const statusOptions: Array<{ value: ModuleProgressEntry['status']; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/** Image thumbnail for a local File (pre-created object URL for instant display). */
function FilePreviewThumbnail({ objectUrl }: Readonly<{ objectUrl: string }>) {
  return (
    <img
      src={objectUrl}
      alt=""
      className="w-12 h-12 rounded object-cover border border-gray-200 flex-shrink-0"
    />
  );
}

export interface EmployeeTrainingEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: string | null;
  onUpdated?: () => void;
}

export const EmployeeTrainingEditModal = ({
  isOpen,
  onClose,
  assignmentId,
  onUpdated,
}: EmployeeTrainingEditModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  /** Local copy of moduleProgress for editing (not saved until user clicks Save). */
  const [moduleProgress, setModuleProgress] = useState<ModuleProgressEntry[]>([]);
  /** Pending files per module; objectUrl is for preview (revoked on remove/close). */
  const [pendingFilesByModule, setPendingFilesByModule] = useState<
    Record<number, Array<{ id: string; file: File; objectUrl: string }>>
  >({});
  const pendingUrlsRef = useRef<Set<string>>(new Set());
  const [modulesExpanded, setModulesExpanded] = useState<Record<number, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadForModuleRef = useRef<number>(0);

  const toggleModuleExpanded = (idx: number, isExpanded: boolean) => {
    setModulesExpanded((p) => ({ ...p, [idx]: !isExpanded }));
  };

  const handleOpenTrainingModuleFile = (f: { publicId: string; resourceType: 'image' | 'raw'; filename?: string }) => {
    handleOpenFile(f.publicId, f.resourceType, f.filename ?? undefined);
  };

  const renderModules = () => {
    if (!detail) return null;
    const savedProgress = detail.moduleProgress ?? [];
    const firstIncomplete = savedProgress.findIndex((p) => p.status !== 'completed');
    const currentModuleIndex =
      firstIncomplete >= 0 ? firstIncomplete : Math.max(0, detail.training.modules.length - 1);
    const defaultExpandedIndex = currentModuleIndex;

    return detail.training.modules.map((mod, idx) => {
      const canExpand = idx <= currentModuleIndex;
      const hasExplicit = Object.keys(modulesExpanded).length > 0;
      const isExpanded =
        canExpand && (hasExplicit ? modulesExpanded[idx] !== false : idx === defaultExpandedIndex);
      const headerLabel = mod.name?.trim()
        ? `Module ${idx + 1} – ${mod.name.trim()}`
        : `Module ${idx + 1}`;
      const progress = moduleProgress[idx] ?? {
        completedAt: null,
        status: 'not_started' as const,
      };
      const savedExtra = progress.extraFiles ?? [];
      const pendingList = pendingFilesByModule[idx] ?? [];
      const totalExtraCount = savedExtra.length + pendingList.length;
      const extraLabelSuffix = totalExtraCount === 1 ? '' : 's';

      return (
        <div key={`${mod.name}-${idx}`} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {canExpand ? (
            <button
              type="button"
              onClick={() => toggleModuleExpanded(idx, isExpanded)}
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
            <div className="border-t border-gray-200 p-4 space-y-4 bg-gray-50/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-secondary text-xs">
                  {mod.duration ?? 1} day{(mod.duration ?? 1) === 1 ? '' : 's'}
                </span>
                <Dropdown
                  options={statusOptions.map((o) => ({ value: o.value, label: o.label }))}
                  value={progress.status}
                  onChange={(value) => setProgressAt(idx, { status: value as ModuleProgressEntry['status'] })}
                  placeholder="Status"
                  aria-label="Module status"
                  allowEmpty={false}
                  className="min-w-[10rem] text-sm"
                />
              </div>

              {mod.moduleFiles?.length > 0 && (
                <div>
                  <p className="text-xs text-secondary font-medium mb-1.5">Training documents</p>
                  <ul className="space-y-0 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                    {mod.moduleFiles.map((f) => (
                      <li key={f.publicId} className="flex items-center gap-2 px-3 py-1.5 min-w-0">
                        {f.resourceType === 'image' ? (
                          <ProxiedImageThumbnail
                            publicId={f.publicId}
                            fallbackFormat={getDocumentFormatFromApiModuleFile(f)}
                          />
                        ) : (
                          <DocumentTypeThumbnail format={getDocumentFormatFromApiModuleFile(f)} />
                        )}
                        <span className="text-sm text-primary truncate min-w-0 flex-1" title={f.filename ?? 'File'}>
                          {f.filename ?? 'View file'}
                        </span>
                        <button
                          type="button"
                          onClick={handleOpenTrainingModuleFile.bind(null, f)}
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

              <label className="block">
                <span className="text-xs text-secondary font-medium">Manager notes</span>
                <textarea
                  value={progress.managerNotes ?? ''}
                  onChange={(e) => setProgressAt(idx, { managerNotes: e.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-primary text-sm resize-y min-h-[60px]"
                  rows={2}
                />
              </label>

              <div className="border-t border-gray-200 pt-4" data-section="additional-documents">
                <p className="text-xs text-secondary font-medium mb-1.5">
                  Additional documents
                  {totalExtraCount > 0 ? (
                    <span className="text-primary ml-1">
                      ({totalExtraCount} file{extraLabelSuffix})
                    </span>
                  ) : null}
                </p>
                {totalExtraCount > 0 ? (
                  <ul className="mb-3 list-none space-y-2 p-0 m-0">
                    {savedExtra.map((f, i) => (
                      <li key={`${f.publicId}-${i}`} className={SAVED_REMOTE_FILE_ROW_CLASSNAME}>
                        {f.resourceType === 'image' ? (
                          <ProxiedImageThumbnail
                            publicId={f.publicId}
                            fallbackFormat={getDocumentFormatFromApiModuleFile(f)}
                          />
                        ) : (
                          <DocumentTypeThumbnail format={getDocumentFormatFromApiModuleFile(f)} />
                        )}
                        <span className="text-sm text-primary truncate min-w-0 flex-1" title={f.filename ?? 'File'}>
                          {f.filename ?? 'View file'}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={handleOpenFile.bind(null, f.publicId, f.resourceType, f.filename)}
                            className="p-1.5 text-primary hover:bg-gray-100 rounded"
                            aria-label="View file"
                            title="View file"
                          >
                            <ViewIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={removeExtraFile.bind(null, idx, i)}
                            className="p-1.5 text-negative hover:bg-red-50 rounded"
                            aria-label="Remove file"
                            title="Remove file"
                          >
                            <span className="text-lg leading-none" aria-hidden>×</span>
                          </button>
                        </div>
                      </li>
                    ))}
                    {pendingList.map((item, i) => (
                      <li key={item.id} className={PENDING_LOCAL_FILE_ROW_CLASSNAME}>
                        {isImageFile(item.file) ? (
                          <FilePreviewThumbnail objectUrl={item.objectUrl} />
                        ) : (
                          <DocumentTypeThumbnail format={getDocumentFormatFromFile(item.file)} />
                        )}
                        <span className="text-sm text-primary truncate min-w-0 flex-1" title={item.file.name}>
                          {item.file.name}
                          <span className={PENDING_UPLOAD_TAG_CLASSNAME}>(pending upload)</span>
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={openFileInNewTab.bind(null, item.file)}
                            className="p-1.5 text-primary hover:bg-gray-100 rounded"
                            aria-label="View file"
                            title="View file"
                          >
                            <ViewIcon className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={removeExtraFile.bind(null, idx, savedExtra.length + i)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            aria-label="Remove file"
                          >
                            <span className="text-lg leading-none" aria-hidden>×</span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-secondary mb-3">No documents added yet.</p>
                )}
                <button
                  type="button"
                  onClick={() => triggerUploadForModule(idx)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-primary text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  <UploadIcon className="w-4 h-4" />
                  Add documents
                </button>
              </div>
            </div>
          )}
        </div>
      );
    });
  };

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
      setModuleProgress([]);
      pendingUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      pendingUrlsRef.current.clear();
      setPendingFilesByModule({});
      trainingAssignmentService
        .getAssignmentById(assignmentId)
        .then((d) => {
          setDetail(d);
          if (d) {
            const len = d.training.modules?.length ?? 0;
            const progress = d.moduleProgress ?? [];
            const next: ModuleProgressEntry[] = Array.from({ length: len }, (_, i) => ({
              completedAt: progress[i]?.completedAt ?? null,
              status: progress[i]?.status ?? 'not_started',
              ...(progress[i]?.managerNotes != null && { managerNotes: progress[i].managerNotes }),
              extraFiles: progress[i]?.extraFiles ?? [],
            }));
            setModuleProgress(next);
          }
        })
        .finally(() => setLoading(false));
    } else if (!isOpen) {
      setDetail(null);
      setModuleProgress([]);
      pendingUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      pendingUrlsRef.current.clear();
      setPendingFilesByModule({});
    }
  }, [isOpen, assignmentId]);

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  const setProgressAt = (index: number, patch: Partial<ModuleProgressEntry>) => {
    setModuleProgress((prev) => {
      const next = [...prev];
      const current = next[index] ?? {
        completedAt: null,
        status: 'not_started' as const,
      };
      const newStatus = patch.status ?? current.status;
      let completedAt: string | null = current.completedAt;
      if (newStatus === 'completed' && current.status !== 'completed') {
        completedAt = new Date().toISOString();
      } else if (newStatus !== 'completed') {
        completedAt = null;
      }
      next[index] = {
        ...current,
        ...patch,
        completedAt,
        status: newStatus,
      };
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!assignmentId || !detail) return;
    setSubmitting(true);
    setError('');
    try {
      const uploadedByModule: Record<number, AssignmentExtraFile[]> = {};
      for (const [modIdxStr, list] of Object.entries(pendingFilesByModule)) {
        if (!list?.length) continue;
        const modIdx = Number(modIdxStr);
        const results = await Promise.allSettled(
          list.map(({ file }) => trainingAssignmentService.uploadAssignmentDocument(assignmentId, file))
        );
        list.forEach(({ objectUrl }) => {
          URL.revokeObjectURL(objectUrl);
          pendingUrlsRef.current.delete(objectUrl);
        });
        const uploaded = results
          .filter((r): r is PromiseFulfilledResult<AssignmentExtraFile> => r.status === 'fulfilled')
          .map((r) => r.value);
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) toast.error(`${failed} file${failed === 1 ? '' : 's'} failed to upload.`);
        if (uploaded.length > 0) uploadedByModule[modIdx] = uploaded;
      }
      const payload: UpdateAssignmentPayload = {
        moduleProgress: moduleProgress.map((p, i) => ({
          completedAt: p.completedAt,
          status: p.status,
          ...(p.managerNotes != null && p.managerNotes !== '' && { managerNotes: p.managerNotes }),
          extraFiles: [...(p.extraFiles ?? []), ...(uploadedByModule[i] ?? [])],
        })),
      };
      await trainingAssignmentService.updateAssignment(assignmentId, payload);
      toast.success('Assignment updated.');
      onUpdated?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update assignment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenFile = (publicId: string, resourceType: 'image' | 'raw', filename?: string) => {
    openDocumentProxyInNewTab(publicId, resourceType, filename).catch(() => { });
  };

  const triggerUploadForModule = (moduleIndex: number) => {
    uploadForModuleRef.current = moduleIndex;
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const fileList = Array.from(files);
    e.target.value = '';
    const moduleIndex = uploadForModuleRef.current;
    const newPending = fileList.map((file, i) => {
      const objectUrl = URL.createObjectURL(file);
      pendingUrlsRef.current.add(objectUrl);
      return {
        id: `pending-${Date.now()}-${moduleIndex}-${i}`,
        file,
        objectUrl,
      };
    });
    setPendingFilesByModule((prev) => ({
      ...prev,
      [moduleIndex]: [...(prev[moduleIndex] ?? []), ...newPending],
    }));
    setTimeout(() => {
      document.querySelector('[data-section="additional-documents"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 100);
  };

  const removeExtraFile = (moduleIndex: number, displayIndex: number) => {
    const saved = moduleProgress[moduleIndex]?.extraFiles ?? [];
    if (displayIndex < saved.length) {
      setModuleProgress((prev) => {
        const next = [...prev];
        const current = next[moduleIndex];
        if (!current?.extraFiles?.length) return prev;
        next[moduleIndex] = {
          ...current,
          extraFiles: current.extraFiles.filter((_, i) => i !== displayIndex),
        };
        return next;
      });
    } else {
      const pendingIndex = displayIndex - saved.length;
      setPendingFilesByModule((prev) => {
        const list = prev[moduleIndex] ?? [];
        const removed = list[pendingIndex];
        if (removed?.objectUrl) {
          URL.revokeObjectURL(removed.objectUrl);
          pendingUrlsRef.current.delete(removed.objectUrl);
        }
        const nextList = list.filter((_, i) => i !== pendingIndex);
        if (nextList.length === 0) {
          const { [moduleIndex]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [moduleIndex]: nextList };
      });
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="edit-assignment-modal-title"
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
            <h2 id="edit-assignment-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Edit Training Assignment
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
            {detail && (
              <>
                <section className="mb-4">
                  <p className="text-primary text-sm font-medium">{detail.user.name}</p>
                  <p className="text-secondary text-xs">{detail.training.name}</p>
                </section>
                <section className="mb-4">
                  <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Modules</h3>
                  <div className="space-y-3">
                    {renderModules()}
                  </div>
                </section>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={TRAINING_DOCUMENT_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </>
            )}
            {error && (
              <p className="mb-2 text-negative text-sm" role="alert">
                {error}
              </p>
            )}
            {detail && (
              <p className="mt-3 text-xs text-secondary">
                Status changes and added documents are saved when you click Save.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  dialogRef.current?.close();
                  onClose();
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-primary text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !detail}
                className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>,
    document.body
  );
};
