/**
 * Accepted MIME types for training module files (match server upload config).
 */
export const TRAINING_DOCUMENT_ACCEPT =
  'image/jpeg,image/jpg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** File row: chosen locally, not yet on the server (training, check-ins, questionnaires). */
export const PENDING_LOCAL_FILE_ROW_CLASSNAME =
  'flex items-center gap-3 p-2 rounded-lg border border-amber-200 bg-amber-50/50';

/** File row: already stored (e.g. Cloudinary). */
export const SAVED_REMOTE_FILE_ROW_CLASSNAME =
  'flex items-center gap-3 p-2 rounded-lg border border-gray-200 bg-white';

/** Inline “(pending upload)” after the filename. */
export const PENDING_UPLOAD_TAG_CLASSNAME = 'text-amber-700 text-xs ml-1';

export interface CreateTrainingModuleFileForm {
  id: string;
  file: File | null;
  publicId: string | null;
  resourceType: 'image' | 'raw' | null;
  /** Original filename (for new: file.name; for existing: from API). */
  filename?: string | null;
  /** File format/extension (e.g. docx, xlsx, pdf) for download with correct extension. */
  format?: string | null;
}

export interface CreateTrainingModuleForm {
  id: string;
  name: string;
  /** Duration in number of days (required). */
  duration: number;
  moduleFiles: CreateTrainingModuleFileForm[];
}

export interface CreateTrainingFormState {
  trainingName: string;
  modules: CreateTrainingModuleForm[];
}

export function removeModuleFileFromTrainingModules(
  modules: CreateTrainingModuleForm[],
  moduleId: string,
  fileId: string,
): CreateTrainingModuleForm[] {
  return modules.map((m) => {
    if (m.id !== moduleId) return m;
    return { ...m, moduleFiles: m.moduleFiles.filter((f) => f.id !== fileId) };
  });
}

type UploadedTrainingModuleFile = {
  publicId: string;
  resourceType: 'image' | 'raw';
  filename?: string;
  format?: string;
};

export async function buildTrainingModulePayloadsForCreate(
  modules: CreateTrainingModuleForm[],
  trainingName: string,
  uploadDocument: (file: File, trainingName: string) => Promise<UploadedTrainingModuleFile>,
): Promise<import('../services/training.service').TrainingModulePayload[]> {
  const payloadModules: import('../services/training.service').TrainingModulePayload[] = [];

  for (const mod of modules) {
    const moduleFiles: import('../services/training.service').TrainingModuleFilePayload[] = [];

    for (const mf of mod.moduleFiles) {
      if (mf.file) {
        const up = await uploadDocument(mf.file, trainingName);
        moduleFiles.push({
          publicId: up.publicId,
          resourceType: up.resourceType,
          ...(up.filename && { filename: up.filename }),
          ...(up.format && { format: up.format }),
        });
        continue;
      }

      if (mf.publicId && mf.resourceType) {
        moduleFiles.push({
          publicId: mf.publicId,
          resourceType: mf.resourceType,
          ...(mf.filename && { filename: mf.filename }),
          ...(mf.format && { format: mf.format }),
        });
      }
    }

    const durationDays = Math.max(1, Number(mod.duration) || 1);
    payloadModules.push({ name: mod.name.trim(), duration: durationDays, moduleFiles });
  }

  return payloadModules;
}

export interface CreateTrainingValidation {
  valid: boolean;
  trainingNameError?: string;
  moduleErrors?: Array<{ nameError?: string; durationError?: string }>;
}

/**
 * Generate a unique id for form items (modules, files).
 */
export function newModuleId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Derive a display name from a Cloudinary publicId (e.g. "folder/name" -> "name").
 */
export function getDisplayNameFromPublicId(publicId: string): string {
  const segment = publicId.split('/').pop();
  return segment ?? publicId;
}

/**
 * Display name for a module file: original filename if present, else file name, else publicId-derived.
 */
export function getModuleFileDisplayName(mf: CreateTrainingModuleFileForm): string {
  if (mf.filename?.trim()) return mf.filename.trim();
  if (mf.file?.name) return mf.file.name;
  if (mf.publicId) return getDisplayNameFromPublicId(mf.publicId);
  return 'File';
}

/**
 * Build suggested download filename (name + extension) for proxy Content-Disposition.
 * Uses format so Word/Excel etc. open correctly (e.g. Report.docx).
 */
export function getDocumentDownloadFilename(mf: CreateTrainingModuleFileForm): string | undefined {
  const name = getModuleFileDisplayName(mf);
  const format = mf.format?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!format) return undefined;
  const base = name.includes('.') ? name.replace(/\.[^.]*$/, '') : name;
  const safeBase = base.replace(/[^\w\s.-]/g, '').trim() || 'document';
  return `${safeBase}.${format}`;
}

/**
 * Get file format/extension from a File (e.g. "pdf", "docx").
 */
export function getDocumentFormatFromFile(file: File): string {
  const name = file.name ?? '';
  if (name.includes('.')) {
    const ext = name.replace(/^.*\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ext) return ext;
  }
  return '';
}

/**
 * Get file format from a module file (format field or from filename).
 */
export function getDocumentFormatFromModuleFile(mf: CreateTrainingModuleFileForm): string {
  const fromFormat = mf.format?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromFormat) return fromFormat;
  const name = getModuleFileDisplayName(mf);
  if (name.includes('.')) {
    const ext = name.replace(/^.*\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ext) return ext;
  }
  return '';
}

/**
 * Get file format from API module file (TrainingModuleFileDetail: format or from filename).
 */
export function getDocumentFormatFromApiModuleFile(f: {
  filename?: string;
  format?: string;
}): string {
  const fromFormat = f.format?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromFormat) return fromFormat;
  const name = f.filename?.trim();
  if (name?.includes('.')) {
    const ext = name.replace(/^.*\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ext) return ext;
  }
  return 'file';
}

/**
 * Open a File in a new tab (creates object URL, opens, revokes after delay).
 */
export function openFileInNewTab(file: File): void {
  const url = URL.createObjectURL(file);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  if (!w) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Map API training detail to create/edit form state (for Edit modal).
 */
export function trainingDetailToFormState(detail: {
  name: string;
  modules: Array<{
    name: string;
    duration?: number;
    moduleFiles: Array<{
      publicId: string;
      resourceType: 'image' | 'raw';
      filename?: string;
      format?: string;
    }>;
  }>;
}): CreateTrainingFormState {
  return {
    trainingName: detail.name,
    modules: detail.modules.map((mod) => ({
      id: newModuleId('module'),
      name: mod.name,
      duration: typeof mod.duration === 'number' && mod.duration >= 1 ? mod.duration : 1,
      moduleFiles: (mod.moduleFiles ?? []).map((f) => ({
        id: newModuleId('file'),
        file: null,
        publicId: f.publicId,
        resourceType: f.resourceType,
        filename: f.filename ?? null,
        format: f.format ?? null,
      })),
    })),
  };
}

/**
 * Validate create training form: training name non-empty; each module has a name and valid duration. Module files are optional.
 */
export function validateCreateTrainingForm(state: CreateTrainingFormState): CreateTrainingValidation {
  const moduleErrors: Array<{ nameError?: string; durationError?: string }> = [];
  let valid = true;

  const trainingNameError = !state.trainingName?.trim()
    ? 'Training name is required'
    : undefined;
  if (trainingNameError) valid = false;

  for (const mod of state.modules) {
    const nameError = !mod.name?.trim() ? 'Module name is required' : undefined;
    const durationError =
      typeof mod.duration !== 'number' || mod.duration < 1
        ? 'Duration (days) is required and must be at least 1'
        : undefined;
    if (nameError || durationError) valid = false;
    moduleErrors.push({ nameError, durationError });
  }

  if (state.modules.length === 0) {
    valid = false;
  }

  return {
    valid,
    trainingNameError: trainingNameError ?? undefined,
    moduleErrors: moduleErrors.length > 0 ? moduleErrors : undefined,
  };
}
