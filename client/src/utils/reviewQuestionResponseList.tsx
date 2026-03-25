import { ReviewQuestionAttachmentLinks } from "../components/ReviewSettings/ReviewQuestionAttachmentLinks";
import type { Question, QuestionResponse } from "../types/review.types";

/**
 * Renders review Q&A with optional questionnaire metadata (order + reference document links).
 * Matches Past Review / Director modals.
 */
export function ReviewQuestionResponseList({
  responses,
  questionnaire,
}: {
  readonly responses: QuestionResponse[];
  readonly questionnaire?: Question[];
}) {
  if (!responses?.length) {
    return <p className="text-sm text-gray-400 italic">No responses</p>;
  }
  const ordered =
    questionnaire && questionnaire.length > 0
      ? [...responses].sort((a, b) => {
        const qa = questionnaire.find((q) => q.id === a.questionId);
        const qb = questionnaire.find((q) => q.id === b.questionId);
        return (qa?.order ?? 0) - (qb?.order ?? 0);
      })
      : responses;
  return (
    <div className="space-y-3">
      {ordered.map((r) => {
        const q = questionnaire?.find((qq) => qq.id === r.questionId);
        return (
          <div key={r.questionId} className="text-sm">
            <span className="font-medium text-black">{r.questionText}</span>
            <ReviewQuestionAttachmentLinks attachments={q?.attachments} />
            <p className="text-gray-800 mt-0.5 whitespace-pre-wrap">{r.answer}</p>
          </div>
        );
      })}
    </div>
  );
}
