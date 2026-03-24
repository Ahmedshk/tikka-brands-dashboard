import type { Types } from "mongoose";

export const QUESTION_TYPES = ["text", "rating", "multiple_choice", "yes_no"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface IReviewQuestionAttachment {
  publicId: string;
  resourceType: "image" | "raw";
  filename?: string;
  format?: string;
}

export interface IQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
  order: number;
  attachments?: IReviewQuestionAttachment[];
}

export interface IReviewSettings {
  _id?: string;
  employeeRoleIds: (Types.ObjectId | string)[];
  managerRoleIds: (Types.ObjectId | string)[];
  directorRoleIds: (Types.ObjectId | string)[];
  selfReviewQuestionnaire: IQuestion[];
  managerReviewQuestionnaire: IQuestion[];
  checkInQuestionnaire: IQuestion[];
  isConfigured: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
