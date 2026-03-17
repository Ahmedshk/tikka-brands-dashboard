/**
 * Per-module progress for a training assignment.
 */
export interface IModuleProgressEntry {
  completedAt: Date | null;
  status: 'not_started' | 'in_progress' | 'completed';
  managerNotes?: string;
  /** Documents uploaded by manager for this module. */
  extraFiles?: IAssignmentExtraFile[];
}

/** Manager-uploaded file on an assignment (same shape as module file). */
export interface IAssignmentExtraFile {
  publicId: string;
  resourceType: 'image' | 'raw';
  filename?: string;
  format?: string;
}

/**
 * Training assignment document: user assigned to a training with per-module progress.
 */
export interface ITrainingAssignment {
  userId: string;
  trainingId: string;
  assignedAt: Date;
  assignedBy?: string;
  moduleProgress: IModuleProgressEntry[];
}

/**
 * Payload for creating assignments (bulk: one per userId).
 */
export interface ICreateAssignmentsPayload {
  trainingId: string;
  userIds: string[];
}

/**
 * Payload for updating an assignment (module progress; each entry may include extraFiles).
 */
export interface IUpdateAssignmentPayload {
  moduleProgress: IModuleProgressEntry[];
}

/**
 * Assignment list item (for card table): summary with user and training info.
 */
export interface IAssignmentListItem {
  _id: string;
  userId: string;
  trainingId: string;
  assignedAt: string;
  trainingName: string;
  moduleCount: number;
  assignTo: string;
  role: string;
  completedModules: number;
  totalModules: number;
  status: 'Complete' | 'Pending';
  /** Per-module duration in days (for segment on-track coloring). */
  moduleDurations: number[];
  /** Per-module progress (for segment on-track coloring). */
  moduleProgress: Array<{ completedAt: string | null; status: string }>;
}

/**
 * Full assignment detail for View/Edit (assignment + user + training with modules).
 */
export interface IAssignmentDetail {
  _id: string;
  userId: string;
  trainingId: string;
  assignedAt: string;
  assignedBy?: string;
  moduleProgress: IModuleProgressEntry[];
  user: {
    name: string;
    email: string;
    role: string;
  };
  training: {
    name: string;
    modules: Array<{
      name: string;
      duration: number;
      moduleFiles: Array<{
        publicId: string;
        resourceType: 'image' | 'raw';
        filename?: string;
        format?: string;
      }>;
    }>;
  };
}
