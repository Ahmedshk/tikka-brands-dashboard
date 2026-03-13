/**
 * A single module file stored in Cloudinary (for proxy URL generation).
 */
export interface ITrainingModuleFile {
  publicId: string;
  resourceType: 'image' | 'raw';
}

/**
 * Training module (subdocument): name + array of module files.
 */
export interface ITrainingModule {
  name: string;
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
