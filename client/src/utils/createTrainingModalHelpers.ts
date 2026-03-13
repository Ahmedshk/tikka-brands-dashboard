/**
 * Accepted MIME types for training module files (match server upload config).
 */
export const TRAINING_DOCUMENT_ACCEPT =
  'image/jpeg,image/jpg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface CreateTrainingModuleFileForm {
  id: string;
  file: File | null;
  publicId: string | null;
  resourceType: 'image' | 'raw' | null;
}

export interface CreateTrainingModuleForm {
  id: string;
  name: string;
  moduleFiles: CreateTrainingModuleFileForm[];
}

export interface CreateTrainingFormState {
  trainingName: string;
  modules: CreateTrainingModuleForm[];
}

export interface CreateTrainingValidation {
  valid: boolean;
  trainingNameError?: string;
  moduleErrors?: Array<{ nameError?: string }>;
}

/**
 * Validate create training form: training name non-empty; each module has a name. Module files are optional.
 */
export function validateCreateTrainingForm(state: CreateTrainingFormState): CreateTrainingValidation {
  const moduleErrors: Array<{ nameError?: string }> = [];
  let valid = true;

  const trainingNameError = !state.trainingName?.trim()
    ? 'Training name is required'
    : undefined;
  if (trainingNameError) valid = false;

  for (const mod of state.modules) {
    const nameError = !mod.name?.trim() ? 'Module name is required' : undefined;
    if (nameError) valid = false;
    moduleErrors.push({ nameError });
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
