import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import UploadIcon from '@assets/icons/upload.svg?react';
import { roleService } from '../../services/role.service';
import { trainingService } from '../../services/training.service';
import type { Training } from '../../types/trainingReviews.types';
import type { RoleRow } from '../../types/rbac.types';
import {
  validateCreateTrainingForm,
  TRAINING_DOCUMENT_ACCEPT,
  type CreateTrainingModuleForm,
  type CreateTrainingModuleFileForm,
} from '../../utils/createTrainingModalHelpers';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const initialModuleFile = (): CreateTrainingModuleFileForm => ({
  id: newId('file'),
  file: null,
  publicId: null,
  resourceType: null,
});

const initialModule = (): CreateTrainingModuleForm => ({
  id: newId('module'),
  name: '',
  moduleFiles: [],
});

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function FilePreviewThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <div className="w-12 h-12 rounded bg-gray-200 animate-pulse" />;
  return (
    <img
      src={url}
      alt=""
      className="w-12 h-12 rounded object-cover border border-gray-200 flex-shrink-0"
    />
  );
}

export interface CreateTrainingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (training: Training) => void;
}

export const CreateTrainingModal = ({
  isOpen,
  onClose,
  onCreated,
}: CreateTrainingModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastAddedModuleIdRef = useRef<string | null>(null);
  const [trainingName, setTrainingName] = useState('');
  const [modules, setModules] = useState<CreateTrainingModuleForm[]>(() => [initialModule()]);
  const [modulesExpanded, setModulesExpanded] = useState<Record<string, boolean>>({});
  const [assignToRolesMode, setAssignToRolesMode] = useState<'none' | 'all' | 'specific'>('none');
  const [assignedRoleIds, setAssignedRoleIds] = useState<string[]>([]);
  const [rolesList, setRolesList] = useState<RoleRow[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState<ReturnType<typeof validateCreateTrainingForm> | null>(null);

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
      lastAddedModuleIdRef.current = null;
      setTrainingName('');
      setModules([initialModule()]);
      setModulesExpanded({});
      setAssignToRolesMode('none');
      setAssignedRoleIds([]);
      setError('');
      setValidation(null);
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setRolesLoading(true);
    roleService
      .list(true)
      .then(setRolesList)
      .catch(() => setRolesList([]))
      .finally(() => setRolesLoading(false));
  }, [isOpen]);

  useEffect(() => {
    const lastId = lastAddedModuleIdRef.current;
    if (!lastId || modules.length === 0) return;
    lastAddedModuleIdRef.current = null;
    setModulesExpanded(() => {
      const next: Record<string, boolean> = {};
      modules.forEach((m) => {
        next[m.id] = m.id === lastId;
      });
      return next;
    });
  }, [modules]);

  const addModule = () => {
    const newMod = initialModule();
    lastAddedModuleIdRef.current = newMod.id;
    setModules((prev) => [...prev, newMod]);
  };

  const setModuleExpanded = (moduleId: string, expanded: boolean) => {
    setModulesExpanded((prev) => {
      if (expanded) {
        return { [moduleId]: true };
      }
      const next = { ...prev };
      next[moduleId] = false;
      return next;
    });
  };

  const removeModule = (id: string) => {
    setModules((prev) => (prev.length > 1 ? prev.filter((m) => m.id !== id) : prev));
  };

  const updateModule = (id: string, updates: Partial<CreateTrainingModuleForm>) => {
    setModules((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  };

  const addModuleFiles = (moduleId: string, fileList: FileList | null) => {
    if (!fileList?.length) return;
    const newEntries: CreateTrainingModuleFileForm[] = Array.from(fileList).map((file) => ({
      id: newId('file'),
      file,
      publicId: null,
      resourceType: null,
    }));
    setModules((prev) =>
      prev.map((m) =>
        m.id === moduleId
          ? { ...m, moduleFiles: [...m.moduleFiles, ...newEntries] }
          : m
      )
    );
  };

  const removeModuleFile = (moduleId: string, fileId: string) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== moduleId) return m;
        const next = m.moduleFiles.filter((f) => f.id !== fileId);
        return { ...m, moduleFiles: next };
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidation(null);
    const state = { trainingName, modules };
    const result = validateCreateTrainingForm(state);
    setValidation(result);
    if (!result.valid) return;

    setSubmitting(true);
    try {
      const trainingNameTrimmed = trainingName.trim();
      const payloadModules: Array<{ name: string; moduleFiles: Array<{ publicId: string; resourceType: 'image' | 'raw' }> }> = [];

      for (const mod of modules) {
        const moduleFiles: Array<{ publicId: string; resourceType: 'image' | 'raw' }> = [];
        for (const mf of mod.moduleFiles) {
          if (mf.file) {
            const up = await trainingService.uploadDocument(mf.file, trainingNameTrimmed);
            moduleFiles.push({ publicId: up.publicId, resourceType: up.resourceType });
          } else if (mf.publicId && mf.resourceType) {
            moduleFiles.push({ publicId: mf.publicId, resourceType: mf.resourceType });
          }
        }
        payloadModules.push({ name: mod.name.trim(), moduleFiles });
      }

      let assignToRoles: 'all' | string[] | undefined;
      if (assignToRolesMode === 'all') {
        assignToRoles = 'all';
      } else if (assignToRolesMode === 'specific' && assignedRoleIds.length > 0) {
        assignToRoles = assignedRoleIds;
      } else {
        assignToRoles = undefined;
      }

      const training = await trainingService.create({
        name: trainingNameTrimmed,
        modules: payloadModules,
        ...(assignToRoles != null && { assignToRoles }),
      });
      onCreated?.(training);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create training');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center bg-transparent border-0 p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="create-training-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-2xl">
        <button
          type="button"
          onClick={() => { dialogRef.current?.close(); onClose(); }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 id="create-training-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              Create Training
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-4 space-y-4 border-x border-gray-200">
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <div>
                <label htmlFor="create-training-name" className="block text-sm font-medium text-primary mb-1">
                  Training name
                </label>
                <input
                  id="create-training-name"
                  type="text"
                  value={trainingName}
                  onChange={(e) => setTrainingName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-primary"
                  placeholder="e.g. Food Safety"
                  autoComplete="off"
                />
                {validation?.trainingNameError && (
                  <p className="mt-1 text-xs text-red-600">{validation.trainingNameError}</p>
                )}
              </div>

              <div className="pt-2 border-t border-gray-200">
                <h3 className="text-sm font-medium text-primary mb-2">Assign to roles</h3>
                <p className="text-xs text-secondary mb-2">
                  Assign this training to none, all roles, or only selected ones.
                </p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-primary">
                    <input
                      type="radio"
                      name="assign-to-roles-mode"
                      checked={assignToRolesMode === 'none'}
                      onChange={() => {
                        setAssignToRolesMode('none');
                        setAssignedRoleIds([]);
                      }}
                      className="rounded-full border-gray-300"
                    />
                    <span>None</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-primary">
                    <input
                      type="radio"
                      name="assign-to-roles-mode"
                      checked={assignToRolesMode === 'all'}
                      onChange={() => {
                        setAssignToRolesMode('all');
                        setAssignedRoleIds([]);
                      }}
                      className="rounded-full border-gray-300"
                    />
                    <span>All roles</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-primary">
                    <input
                      type="radio"
                      name="assign-to-roles-mode"
                      checked={assignToRolesMode === 'specific'}
                      onChange={() => setAssignToRolesMode('specific')}
                      className="rounded-full border-gray-300"
                    />
                    <span>Specific roles</span>
                  </label>
                  {assignToRolesMode === 'specific' && (
                    <div className="pl-6 mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
                      {rolesLoading && <p className="text-xs text-secondary">Loading roles…</p>}
                      {!rolesLoading && rolesList.length === 0 && (
                        <p className="text-xs text-secondary">No roles available.</p>
                      )}
                      {!rolesLoading && rolesList.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {rolesList.map((role) => {
                            const checked = assignedRoleIds.includes(role.id);
                            return (
                              <label
                                key={role.id}
                                className="flex items-center gap-2 text-sm text-secondary cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setAssignedRoleIds((prev) =>
                                      checked ? prev.filter((id) => id !== role.id) : [...prev, role.id]
                                    );
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <span>{role.roleName}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-primary">Modules</span>
                  <button
                    type="button"
                    onClick={addModule}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-primary hover:bg-gray-50"
                  >
                    + Add module
                  </button>
                </div>
                <div className="space-y-4">
                  {modules.map((mod, index) => {
                    const hasExplicitState = Object.keys(modulesExpanded).length > 0;
                    const isExpanded = hasExplicitState
                      ? Boolean(modulesExpanded[mod.id])
                      : index === 0;
                    const headerLabel = mod.name.trim()
                      ? `Module ${index + 1} – ${mod.name.trim()}`
                      : `Module ${index + 1}`;
                    return (
                      <div
                        key={mod.id}
                        className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setModuleExpanded(mod.id, !isExpanded)}
                          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-primary hover:bg-gray-100/80 transition-colors"
                        >
                          <span>{headerLabel}</span>
                          <span className="text-gray-500 shrink-0" aria-hidden>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="border-t border-gray-200 p-4 space-y-3 bg-gray-50/50">
                            {modules.length > 1 && (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeModule(mod.id)}
                                  className="text-xs text-red-600 hover:underline"
                                >
                                  Remove module
                                </button>
                              </div>
                            )}
                            <div>
                              <label htmlFor={`module-name-${mod.id}`} className="block text-xs font-medium text-primary mb-1">
                                Module name
                              </label>
                              <input
                                id={`module-name-${mod.id}`}
                                type="text"
                                value={mod.name}
                                onChange={(e) => updateModule(mod.id, { name: e.target.value })}
                                className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-primary"
                                placeholder="e.g. Introduction"
                              />
                              {validation?.moduleErrors?.[index]?.nameError && (
                                <p className="mt-0.5 text-xs text-red-600">{validation.moduleErrors[index].nameError}</p>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-primary">Module files</span>
                                <input
                                  id={`module-files-input-${mod.id}`}
                                  type="file"
                                  accept={TRAINING_DOCUMENT_ACCEPT}
                                  multiple
                                  onChange={(e) => {
                                    addModuleFiles(mod.id, e.target.files);
                                    e.target.value = '';
                                  }}
                                  className="sr-only"
                                  aria-label="Upload files"
                                />
                                <button
                                  type="button"
                                  onClick={() => document.getElementById(`module-files-input-${mod.id}`)?.click()}
                                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-primary bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0"
                                >
                                  <UploadIcon className="w-4 h-4" />
                                  Upload files
                                </button>
                              </div>
                              {mod.moduleFiles.length > 0 ? (
                                <ul className="space-y-2">
                                  {mod.moduleFiles.map((mf) =>
                                    mf.file ? (
                                      <li
                                        key={mf.id}
                                        className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 bg-white"
                                      >
                                        {isImageFile(mf.file) ? (
                                          <FilePreviewThumbnail file={mf.file} />
                                        ) : (
                                          <div className="w-12 h-12 rounded bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                                            <span className="text-gray-400 text-xs font-medium">DOC</span>
                                          </div>
                                        )}
                                        <span
                                          className="text-sm text-primary truncate min-w-0 flex-1"
                                          title={mf.file.name}
                                        >
                                          {mf.file.name}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => removeModuleFile(mod.id, mf.id)}
                                          className="p-1.5 text-red-600 hover:bg-red-50 rounded shrink-0"
                                          aria-label="Remove file"
                                        >
                                          <span className="text-lg leading-none" aria-hidden>×</span>
                                        </button>
                                      </li>
                                    ) : null
                                  )}
                                </ul>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50/50">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-primary hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-button-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>,
    document.body
  );
};
