import type { ReactNode } from 'react';
import type { Question, QuestionResponse, ReviewCycle, ReviewCycleStatus } from '../types/review.types';

export function isManagerReviewSubmittedToDirector(status: ReviewCycleStatus): boolean {
  return [
    'manager_review_submitted',
    'director_approval_due',
    'director_approval_pending',
    'director_approval_past_due',
    'approved',
    'sharing_due',
    'sharing_pending',
    'sharing_past_due',
    'completed',
    'checkin_30_due',
    'checkin_30_past_due',
    'checkin_30_complete',
    'checkin_30_done',
    'checkin_60_due',
    'checkin_60_past_due',
    'checkin_60_complete',
    'checkin_60_done',
    'cycle_complete',
  ].includes(status);
}

export function canManagerDoReview(status: ReviewCycleStatus): boolean {
  return [
    'self_review_submitted',
    'manager_review_due',
    'manager_review_pending',
    'manager_review_past_due',
  ].includes(status);
}

export function shouldShowDirectorReturnCallout(
  reviewCycle: ReviewCycle | null,
  status: ReviewCycleStatus,
): boolean {
  if (reviewCycle?.directorDecision !== 'rejected') return false;
  return ['manager_review_due', 'manager_review_pending', 'manager_review_past_due'].includes(status);
}

export function buildManagerReviewResponses(
  questions: Question[],
  answers: Record<string, string>,
): QuestionResponse[] {
  return questions.map((q) => ({
    questionId: q.id,
    questionText: q.text,
    answer: answers[q.id] ?? '',
  }));
}

export function renderManagerReviewQuestionField(
  q: Question,
  value: string,
  onChange: (v: string) => void,
  disabled: boolean,
): ReactNode {
  switch (q.type) {
    case 'text':
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-button-primary/20 disabled:bg-gray-50"
        />
      );
    case 'rating':
      return (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onChange(String(v))}
              className={`w-10 h-10 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${
                value === String(v)
                  ? 'bg-button-primary text-white border-button-primary'
                  : 'bg-white border-gray-200 hover:border-gray-400'
              } disabled:opacity-60`}
            >
              {v}
            </button>
          ))}
        </div>
      );
    case 'multiple_choice':
      return (
        <div className="space-y-1">
          {(q.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`mgr-${q.id}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={disabled}
              />
              {opt}
            </label>
          ))}
        </div>
      );
    case 'yes_no':
      return (
        <div className="flex gap-3">
          {['Yes', 'No'].map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onChange(v)}
              className={`px-4 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                value === v
                  ? 'bg-button-primary text-white border-button-primary'
                  : 'bg-white border-gray-200 hover:border-gray-400'
              } disabled:opacity-60`}
            >
              {v}
            </button>
          ))}
        </div>
      );
    default:
      return null;
  }
}

