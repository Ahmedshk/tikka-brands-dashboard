/** Staff list table row */
export interface StaffListRow {
  name: string;
  role: string;
  /** Hire date for display (mm/dd/yyyy) */
  hireDate: string;
  tenure: string;
  reviewStatus: 'Complete' | 'Due Soon' | 'Over Due';
}

/** Recently completed review item */
export interface RecentlyCompletedReviewItem {
  name: string;
  reviewType: string;
  status: string;
  /** Date of completion for display (mm/dd/yyyy) */
  completedDate: string;
}

/** Per-module progress for an assignment */
export interface ModuleProgressEntry {
  completedAt: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
  managerNotes?: string;
  /** Documents uploaded by manager for this module. */
  extraFiles?: AssignmentExtraFile[];
}

/** Per-module progress as returned from list API (for segment on-track coloring) */
export interface ModuleProgressListItem {
  completedAt: string | null;
  status: string;
}

/** Employee training table row (from list assignments by location) */
export interface EmployeeTrainingRow {
  assignmentId: string;
  userId: string;
  trainingId: string;
  trainingName: string;
  assignTo: string;
  /** Employee role (e.g. Store Manager, Cashier) */
  role: string;
  /** 0–100 or computed from completedModules/totalModules */
  progress: number;
  status: 'Complete' | 'Pending';
  completedModules: number;
  totalModules: number;
  assignedAt: string;
  /** Per-module duration in days (for segment on-track coloring). */
  moduleDurations: number[];
  /** Per-module progress (for segment on-track coloring). */
  moduleProgress: ModuleProgressListItem[];
}

/** Extra file uploaded by manager for an assignment (same shape as module file) */
export interface AssignmentExtraFile {
  publicId: string;
  resourceType: 'image' | 'raw';
  filename?: string;
  format?: string;
}

/** Full assignment detail for View/Edit modals */
export interface AssignmentDetail {
  id: string;
  userId: string;
  trainingId: string;
  assignedAt: string;
  assignedBy?: string;
  moduleProgress: ModuleProgressEntry[];
  user: { name: string; email: string; role: string };
  training: {
    name: string;
    modules: Array<{
      name: string;
      duration: number;
      moduleFiles: TrainingModuleFileDetail[];
    }>;
  };
}

/** Payload for updating an assignment */
export interface UpdateAssignmentPayload {
  moduleProgress: ModuleProgressEntry[];
}

/** A created training (course/program) shown in the Trainings card */
export interface Training {
  id: string;
  name: string;
  moduleCount: number;
  /** Sum of all module durations in days */
  durationDays: number;
}

/** Module file as returned from API (existing upload) */
export interface TrainingModuleFileDetail {
  publicId: string;
  resourceType: 'image' | 'raw';
  /** Original filename at upload (optional). */
  filename?: string;
  /** File format/extension (e.g. docx, xlsx, pdf) for download with correct extension. */
  format?: string;
}

/** Module with files (for edit / full training) */
export interface TrainingModuleDetail {
  name: string;
  /** Duration in number of days. */
  duration: number;
  moduleFiles: TrainingModuleFileDetail[];
}

/** Full training detail for editing (includes modules and assignToRoles) */
export interface TrainingDetail {
  id: string;
  name: string;
  modules: TrainingModuleDetail[];
  assignToRoles?: 'all' | string[];
}
