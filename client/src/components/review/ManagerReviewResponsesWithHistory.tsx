import type { ManagerReview, Question } from "../../types/review.types";
import { ReviewQuestionResponseList } from "../../utils/reviewQuestionResponseList";

export type ManagerReviewHistoryAccent = "green" | "violet" | "gray";

const ACCENT_HEADING: Record<ManagerReviewHistoryAccent, string> = {
  green: "text-green-800",
  violet: "text-violet-700",
  gray: "text-gray-600",
};

export interface ManagerReviewResponsesWithHistoryProps {
  readonly managerReview: ManagerReview;
  readonly questionnaire?: Question[];
  /** Heading color for section titles */
  readonly accent?: ManagerReviewHistoryAccent;
  /**
   * When false, only saved snapshots are shown (e.g. manager modal where the form is the current version).
   * @default true
   */
  readonly showCurrentResponses?: boolean;
}

/**
 * Read-only manager review: every `revisionHistory` snapshot (chronological) plus optional “current” answers.
 */
export function ManagerReviewResponsesWithHistory({
  managerReview,
  questionnaire,
  accent = "green",
  showCurrentResponses = true,
}: ManagerReviewResponsesWithHistoryProps) {
  const headingClass = ACCENT_HEADING[accent];
  const history = managerReview.revisionHistory ?? [];

  return (
    <div className="space-y-4">
      {history.length > 0 && (
        <div className="space-y-3">
          <h4 className={`text-xs font-semibold ${headingClass} mb-1`}>Saved versions</h4>
          <p className="text-xs text-gray-500 mb-2">
            Snapshots from each time the review was saved or submitted. Open a version to see that wording.
          </p>
          {history.map((rev, idx) => (
            <details
              key={`mgr-snap-${idx}-${String(rev.updatedAt)}`}
              className="border border-gray-100 rounded-lg p-3 bg-white/70"
            >
              <summary className="text-xs font-medium text-gray-500 cursor-pointer">
                Version {idx + 1} — {new Date(rev.updatedAt).toLocaleString()}
              </summary>
              <div className="mt-2">
                <ReviewQuestionResponseList responses={rev.responses ?? []} questionnaire={questionnaire} />
              </div>
            </details>
          ))}
        </div>
      )}

      {showCurrentResponses && (
        <div>
          <h4 className={`text-xs font-semibold ${headingClass} mb-2`}>
            {history.length > 0 ? "Current version (latest answers)" : "Manager review"}
          </h4>
          <ReviewQuestionResponseList responses={managerReview.responses ?? []} questionnaire={questionnaire} />
        </div>
      )}
    </div>
  );
}
