import { differenceInCalendarMonths } from "date-fns";
import { API_BASE_URL } from "./constants";

/** Same pattern as server `toUserDTO` profile image URL. */
export function getUserProfileProxyImageUrl(
  userId: string,
  profileImagePublicId?: string | null,
): string | null {
  const id = userId.trim();
  const pid = profileImagePublicId?.trim();
  if (!id || !pid) return null;
  const base = API_BASE_URL.replace(/\/$/, "");
  return `${base}/proxy/image/${encodeURIComponent(id)}`;
}

/**
 * Tenure from start date to `end` as compact years and months (e.g. `2y 3m`, `5m`, `1y`).
 */
export function formatTenureYearsMonths(
  startInput: string | Date | undefined | null,
  end: Date = new Date(),
): string | null {
  if (startInput == null) return null;
  const start = typeof startInput === "string" ? new Date(startInput) : startInput;
  if (Number.isNaN(start.getTime())) return null;
  const totalMonths = differenceInCalendarMonths(end, start);
  if (totalMonths < 0) return null;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0 && m === 0) return "0m";
  const parts: string[] = [];
  if (y > 0) parts.push(`${y}y`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(" ");
}

export function employeeDisplayName(emp: {
  firstName?: string;
  lastName?: string;
  email?: string;
}): string {
  const n = [emp.firstName, emp.lastName].filter(Boolean).join(" ").trim();
  return n || emp.email?.trim() || "—";
}

/** Homebase `job.wage_rate` as USD (omit row if missing/invalid). */
export function formatHomebaseWageRate(rate: unknown): string | null {
  if (rate == null || rate === "") return null;
  let n: number;
  if (typeof rate === "number") {
    n = rate;
  } else if (typeof rate === "string") {
    n = Number.parseFloat(rate);
  } else {
    return null;
  }
  if (Number.isNaN(n)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Homebase `job.wage_type` for display (omit row if missing). */
export function formatHomebaseWageType(type: unknown): string | null {
  if (type == null || typeof type !== "string") return null;
  const t = type.trim();
  if (!t) return null;
  return t.replaceAll("_", " ");
}

export function employeeInitials(emp: { firstName?: string; lastName?: string; email?: string }): string {
  const f = emp.firstName?.trim().charAt(0) ?? "";
  const l = emp.lastName?.trim().charAt(0) ?? "";
  if (f && l) return `${f}${l}`.toUpperCase();
  if (f) return f.toUpperCase();
  const e = emp.email?.trim().charAt(0);
  return e ? e.toUpperCase() : "?";
}

/** Populated `reviewedByManagerId` / `approvedByDirectorId` on a review cycle (lean + populate). */
export function personLabelFromReviewRef(
  ref:
    | string
    | { firstName?: string; lastName?: string; email?: string; role?: string }
    | undefined
    | null,
): string {
  if (!ref || typeof ref === "string") return "—";
  return employeeDisplayName(ref);
}

export function personRoleFromReviewRef(
  ref: string | { role?: string } | undefined | null,
): string | null {
  if (!ref || typeof ref === "string") return null;
  return ref.role?.trim() || null;
}

/** Name and role line for modal headers (Director, Manager, Final review). */
export function reviewEmployeeHeaderSubtitle(cycle: {
  employeeId:
    | string
    | { firstName?: string; lastName?: string; email?: string; role?: string }
    | undefined;
} | null): { name: string; role: string | null } | null {
  const emp = cycle && typeof cycle.employeeId === "object" ? cycle.employeeId : null;
  if (!emp) return null;
  return { name: employeeDisplayName(emp), role: emp.role?.trim() || null };
}
