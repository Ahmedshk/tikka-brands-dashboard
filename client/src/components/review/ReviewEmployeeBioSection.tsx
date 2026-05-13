import type { ReviewCycle } from "../../types/review.types";
import { getReviewEmployeeBioViewModel } from "../../utils/reviewEmployeeBioSectionHelpers";

export interface ReviewEmployeeBioSectionProps {
  readonly cycle: ReviewCycle | null;
  /** Passed to `aria-labelledby` on the section title. */
  readonly sectionHeadingId?: string;
}

/**
 * Shared employee profile block for review modals (Director, Manager, Final review / sharing).
 */
export function ReviewEmployeeBioSection({
  cycle,
  sectionHeadingId = "review-employee-bio-heading",
}: ReviewEmployeeBioSectionProps) {
  const vm = getReviewEmployeeBioViewModel(cycle);

  if (vm.kind === "none") return null;
  if (vm.kind === "unavailable") {
    return <p className="text-sm text-gray-500">Employee profile is not available for this cycle.</p>;
  }

  const avatarNode = vm.avatarUrl ? (
    <img
      src={vm.avatarUrl}
      alt=""
      className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-white shadow ring-1 ring-gray-200"
    />
  ) : (
    <div
      className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl md:text-2xl font-semibold border-2 border-white shadow ring-1 ring-gray-200"
      aria-hidden
    >
      {vm.employeeInitials}
    </div>
  );

  const emailNode = vm.email && vm.emailHref ? (
    <a href={vm.emailHref} className="break-all font-medium text-gray-900 hover:underline underline-offset-2">
      {vm.email}
    </a>
  ) : (
    "—"
  );

  const phoneNode = vm.phone && vm.phoneHref ? (
    <a href={vm.phoneHref} className="font-medium text-gray-900 hover:underline underline-offset-2">
      {vm.phone}
    </a>
  ) : (
    "—"
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 md:p-5" aria-labelledby={sectionHeadingId}>
      <h3 id={sectionHeadingId} className="text-xs font-semibold text-secondary uppercase tracking-wide mb-3">
        Employee bio
      </h3>
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        <div className="shrink-0 flex justify-center sm:justify-start">{avatarNode}</div>
        <dl className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="sm:col-span-2">
            <dt className="sr-only">Name</dt>
            <dd className="text-base font-semibold text-primary">{vm.employeeName}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-gray-500">Role</dt>
            <dd className="font-medium text-gray-900">{vm.employeeRole ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2 sm:gap-y-1">
            <div className="min-w-0">
              <dt className="text-xs text-gray-500">Start date</dt>
              <dd className="font-medium text-gray-900">{vm.startDateDisplay}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-gray-500">Tenure</dt>
              <dd className="font-medium text-gray-900">{vm.tenureDisplay}</dd>
            </div>
          </div>
          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-2 sm:gap-y-1">
            <div className="min-w-0">
              <dt className="text-xs text-gray-500">Email</dt>
              <dd className="font-medium text-gray-900 min-w-0">{emailNode}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-gray-500">Phone</dt>
              <dd className="font-medium text-gray-900">{phoneNode}</dd>
            </div>
          </div>
          {vm.wageRateLabel ? (
            <div>
              <dt className="text-xs text-gray-500">Wage rate</dt>
              <dd className="font-medium text-gray-900">{vm.wageRateLabel}</dd>
            </div>
          ) : null}
          {vm.wageTypeLabel ? (
            <div>
              <dt className="text-xs text-gray-500">Wage type</dt>
              <dd className="font-medium text-gray-900 capitalize">{vm.wageTypeLabel}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}
