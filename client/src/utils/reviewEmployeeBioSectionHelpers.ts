import {
  employeeDisplayName,
  employeeInitials,
  formatHomebaseWageRate,
  formatHomebaseWageType,
  formatTenureYearsMonths,
  getUserProfileProxyImageUrl,
} from "./employeeBioHelpers";
import type { ReviewCycle } from "../types/review.types";

export type ReviewEmployeeBioViewModel =
  | { kind: "none" }
  | { kind: "unavailable" }
  | {
      kind: "available";
      employeeName: string;
      employeeInitials: string;
      employeeRole: string | null;
      startDateDisplay: string;
      tenureDisplay: string;
      email: string | null;
      emailHref: string | null;
      phone: string | null;
      phoneHref: string | null;
      avatarUrl: string | null;
      wageRateLabel: string | null;
      wageTypeLabel: string | null;
    };

function formatEmail(email: unknown): { value: string | null; href: string | null } {
  const trimmed = typeof email === "string" ? email.trim() : "";
  if (!trimmed) return { value: null, href: null };
  return { value: trimmed, href: `mailto:${trimmed}` };
}

function formatPhone(phone: unknown): { value: string | null; href: string | null } {
  const trimmed = typeof phone === "string" ? phone.trim() : "";
  if (!trimmed) return { value: null, href: null };
  const tel = trimmed.replaceAll(/\s/g, "");
  return { value: trimmed, href: `tel:${tel}` };
}

export function getReviewEmployeeBioViewModel(cycle: ReviewCycle | null): ReviewEmployeeBioViewModel {
  if (!cycle) return { kind: "none" };

  const emp = typeof cycle.employeeId === "object" && cycle.employeeId ? cycle.employeeId : null;
  if (!emp) {
    return typeof cycle.employeeId === "string" ? { kind: "unavailable" } : { kind: "none" };
  }

  const employeeIdStr = emp._id ?? null;
  const avatarUrl =
    employeeIdStr ? getUserProfileProxyImageUrl(employeeIdStr, emp.profileImagePublicId) : null;

  const { value: email, href: emailHref } = formatEmail(emp.email);
  const { value: phone, href: phoneHref } = formatPhone(emp.phone);

  const startDateDisplay = emp.startDate ? new Date(emp.startDate).toLocaleDateString() : "—";
  const tenureDisplay = emp.startDate ? formatTenureYearsMonths(emp.startDate) ?? "—" : "—";

  return {
    kind: "available",
    employeeName: employeeDisplayName(emp),
    employeeInitials: employeeInitials(emp),
    employeeRole: emp.role?.trim() || null,
    startDateDisplay,
    tenureDisplay,
    email,
    emailHref,
    phone,
    phoneHref,
    avatarUrl,
    wageRateLabel: formatHomebaseWageRate(emp.homebaseData?.job?.wage_rate),
    wageTypeLabel: formatHomebaseWageType(emp.homebaseData?.job?.wage_type),
  };
}

