/**
 * Denormalized fields on SquarePayment for indexed range queries (rollups, reporting).
 */

function parseSquareIsoToDate(iso: string | undefined | null): Date | null {
  if (typeof iso !== "string" || iso.trim().length === 0) return null;
  const d = new Date(iso.trim());
  return Number.isFinite(d.getTime()) ? d : null;
}

export function getSquarePaymentStatusFromRaw(
  raw: Record<string, unknown>,
): string | null {
  const s = raw.status;
  if (typeof s !== "string" || s.trim().length === 0) return null;
  return s.trim();
}

/** Square API `created_at` on the payment object. */
export function getSquarePaymentCreatedAtFromRaw(
  raw: Record<string, unknown>,
): Date | null {
  return parseSquareIsoToDate(raw.created_at as string | undefined);
}

export interface SquarePaymentMongoIndexFields {
  paymentCreatedAt: Date | null;
  paymentStatus: string | null;
}

export function getSquarePaymentMongoIndexFields(
  raw: Record<string, unknown>,
): SquarePaymentMongoIndexFields {
  return {
    paymentCreatedAt: getSquarePaymentCreatedAtFromRaw(raw),
    paymentStatus: getSquarePaymentStatusFromRaw(raw),
  };
}

/**
 * Payments included in daily payment rollups: captured / approved totals only.
 */
export function isSquarePaymentCountedInDailyRollup(status: string | null): boolean {
  if (!status) return false;
  const u = status.toUpperCase();
  return u === "COMPLETED" || u === "APPROVED";
}

export function getSquarePaymentAmountCentsFromRaw(
  raw: Record<string, unknown>,
): number | null {
  const amountMoney = raw.amount_money as
    | { amount?: bigint | number | string }
    | undefined;
  const a = amountMoney?.amount;
  if (a == null) return null;
  if (typeof a === "bigint") return Number(a);
  if (typeof a === "number") return Number.isFinite(a) ? a : null;
  const n = Number(a);
  return Number.isFinite(n) ? n : null;
}
