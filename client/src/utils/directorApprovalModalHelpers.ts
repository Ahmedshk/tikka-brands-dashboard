import type { ReviewCycleStatus, SalaryIncrementType } from '../types/review.types';

export function canDirectorDecide(status: ReviewCycleStatus): boolean {
  return [
    'manager_review_submitted',
    'director_approval_due',
    'director_approval_pending',
    'director_approval_past_due',
  ].includes(status);
}

/** Salary field: digits and one decimal only (blocks e/E/+/− elsewhere). */
export function sanitizeSalaryIncrementInput(raw: string): string {
  const digitsAndDot = raw.replaceAll(/[^0-9.]/g, '');
  const firstDot = digitsAndDot.indexOf('.');
  if (firstDot === -1) return digitsAndDot;
  return (
    digitsAndDot.slice(0, firstDot + 1) +
    digitsAndDot.slice(firstDot + 1).replaceAll('.', '')
  );
}

export function buildSalaryIncrementPayload(
  salaryIncrementRaw: string,
  kind: SalaryIncrementType,
): { salaryIncrement?: number; salaryIncrementType?: SalaryIncrementType } {
  const trimmed = salaryIncrementRaw.trim();
  if (!trimmed) return {};
  const n = Number.parseFloat(trimmed);
  if (Number.isNaN(n)) return {};
  return { salaryIncrement: n, salaryIncrementType: kind };
}

export function submitDecisionLabel(
  decision: 'approve' | 'reject',
  submitting: boolean,
): string {
  if (submitting) return 'Submitting...';
  return decision === 'approve' ? 'Approve Review' : 'Reject Review';
}

