/**
 * A single module file stored in Cloudinary (for proxy URL generation).
 */
export interface ITrainingModuleFile {
  publicId: string;
  resourceType: 'image' | 'raw';
  /** Original filename at upload (optional, for display). */
  filename?: string;
  /** File format/extension from Cloudinary or upload (e.g. docx, xlsx, pdf) for correct download. */
  format?: string;
}

/**
 * Training module (subdocument): name, duration in days, and array of module files.
 */
export interface ITrainingModule {
  name: string;
  /** Duration in number of days (required). */
  duration: number;
  moduleFiles: ITrainingModuleFile[];
}

/**
 * Optional assign-to-roles: 'all' or list of role IDs.
 */
export type AssignToRoles = 'all' | string[];

/**
 * Payload for creating a training.
 */
export interface ICreateTrainingPayload {
  name: string;
  modules: ITrainingModule[];
  /** Optional: assign training to all roles or specific role IDs. */
  assignToRoles?: AssignToRoles;
}

/**
 * Training as returned from API (id, name, modules, assignToRoles, timestamps).
 */
export interface ITrainingResponse {
  _id: string;
  name: string;
  modules: ITrainingModule[];
  assignToRoles?: AssignToRoles;
  createdAt: string;
  updatedAt: string;
}
