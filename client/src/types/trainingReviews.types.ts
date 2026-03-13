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

/** Employee training table row */
export interface EmployeeTrainingRow {
  trainingName: string;
  assignTo: string;
  /** Employee role (e.g. Store Manager, Cashier) */
  role: string;
  progress: number;
  status: 'Complete' | 'Pending';
  /** Number of modules completed (for status display e.g. "Complete (4/4)") */
  completedModules: number;
  /** Total number of modules */
  totalModules: number;
}

/** A created training (course/program) shown in the Trainings card */
export interface Training {
  id: string;
  name: string;
  moduleCount: number;
}
