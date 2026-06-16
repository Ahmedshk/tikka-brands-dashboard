import type { Question } from '../types/review.types';

export interface ReviewSettingsSnapshot {
  employeeRoleIds: string[];
  managerRoleIds: string[];
  directorRoleIds: string[];
  selfReviewQuestions: Question[];
  managerReviewQuestions: Question[];
  checkInQuestions: Question[];
}

export function extractReviewRoleId(item: string | { _id: string }): string {
  return typeof item === 'string' ? item : item._id;
}

export function buildReviewSettingsSnapshot(
  employeeRoleIds: string[],
  managerRoleIds: string[],
  directorRoleIds: string[],
  selfReviewQuestions: Question[],
  managerReviewQuestions: Question[],
  checkInQuestions: Question[],
): ReviewSettingsSnapshot {
  return {
    employeeRoleIds: [...employeeRoleIds],
    managerRoleIds: [...managerRoleIds],
    directorRoleIds: [...directorRoleIds],
    selfReviewQuestions: structuredClone(selfReviewQuestions),
    managerReviewQuestions: structuredClone(managerReviewQuestions),
    checkInQuestions: structuredClone(checkInQuestions),
  };
}

export const EMPTY_REVIEW_SETTINGS_SNAPSHOT: ReviewSettingsSnapshot =
  buildReviewSettingsSnapshot([], [], [], [], [], []);
