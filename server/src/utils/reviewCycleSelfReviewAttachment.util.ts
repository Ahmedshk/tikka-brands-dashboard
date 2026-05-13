export type SelfReviewQuestionnaireAttachment = {
  publicId: string;
  resourceType: "image" | "raw";
  filename?: string;
  format?: string;
};

export type SelfReviewQuestionnaireQuestion = {
  attachments?: SelfReviewQuestionnaireAttachment[];
};

export function findSelfReviewAttachmentInQuestionnaire(
  questionnaire: SelfReviewQuestionnaireQuestion[],
  publicId: string,
): { resourceType: "image" | "raw"; filename?: string; format?: string } | null {
  const target = publicId.trim();
  if (!target) return null;

  for (const q of questionnaire) {
    const attachments = q.attachments;
    for (const a of attachments ?? []) {
      if (a.publicId === target) {
        return {
          resourceType: a.resourceType,
          ...(a.filename ? { filename: a.filename } : {}),
          ...(a.format ? { format: a.format } : {}),
        };
      }
    }
  }

  return null;
}

