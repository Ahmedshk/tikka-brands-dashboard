/**
 * Square order **business** creation time from the embedded `raw` payload only.
 *
 * Do not use the parent Mongo document's `createdAt` / `updatedAt` — those are import/sync
 * timestamps from Mongoose `{ timestamps: true }`, not Square's order time.
 *
 * Square's field is `created_at`; `createdAt` here is only a camelCase alias if present inside `raw`.
 */
export function getSquareOrderCreatedAtMsFromRaw(
  raw: Record<string, unknown>,
): number | null {
  const v =
    raw.created_at ??
    raw.createdAt ??
    (typeof raw.order === "object" &&
    raw.order != null &&
    !Array.isArray(raw.order)
      ? (raw.order as Record<string, unknown>).created_at ??
        (raw.order as Record<string, unknown>).createdAt
      : undefined);
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const t = v > 1e12 ? v : v * 1000;
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/**
 * Order `state` from Square order JSON (SearchOrders body, webhook `data.object.order`, or Mongo `raw`).
 * Some payloads nest the resource under `order` or duplicate under `raw`.
 */
export function getSquareOrderStateFromPayload(payload: unknown): string | undefined {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const pick = (obj: Record<string, unknown>): string | undefined => {
    const s = obj.state;
    if (s == null) return undefined;
    if (typeof s === "string") return s.trim() !== "" ? s : undefined;
    if (typeof s === "number" || typeof s === "boolean") return String(s);
    return undefined;
  };
  const o = payload as Record<string, unknown>;
  const fromTop = pick(o);
  if (fromTop) return fromTop;
  const order = o.order;
  if (order != null && typeof order === "object" && !Array.isArray(order)) {
    const s = pick(order as Record<string, unknown>);
    if (s) return s;
  }
  const raw = o.raw;
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    const s = pick(raw as Record<string, unknown>);
    if (s) return s;
  }
  return undefined;
}

/** Square order canceled state: US `CANCELED` or common `CANCELLED` spelling (case-insensitive). */
export function isSquareOrderStateCanceled(state: string | undefined): boolean {
  if (state == null) return false;
  const u = state.trim().toUpperCase();
  return u === "CANCELED" || u === "CANCELLED";
}

/**
 * True if a Mongo `raw` order payload is canceled (top-level `state` or nested `order.state`).
 * Used when loading from DB so CANCELED rows never reach aggregation even if other helpers miss a shape edge case.
 */
export function isRawSquareOrderCanceled(raw: Record<string, unknown>): boolean {
  const canceledFrom = (obj: Record<string, unknown> | undefined): boolean => {
    if (obj == null) return false;
    const s = obj.state;
    return typeof s === "string" && isSquareOrderStateCanceled(s);
  };
  if (canceledFrom(raw)) return true;
  const order = raw.order;
  if (order != null && typeof order === "object" && !Array.isArray(order)) {
    return canceledFrom(order as Record<string, unknown>);
  }
  return false;
}

/**
 * Square `Tender` payment outcome for dashboard metrics.
 *
 * Status enums (per Square API): card / BNPL / Square Account / digital wallet use
 * AUTHORIZED, CAPTURED, FAILED, VOIDED. Bank account ACH uses PENDING, COMPLETED, FAILED.
 *
 * @see https://developer.squareup.com/reference/square/objects/Tender
 * @see https://developer.squareup.com/reference/square/objects/TenderCardDetails
 * @see https://developer.squareup.com/reference/square/objects/TenderBuyNowPayLaterDetails
 * @see https://developer.squareup.com/reference/square/objects/TenderSquareAccountDetails
 * @see https://developer.squareup.com/reference/square/objects/DigitalWalletDetails
 * @see https://developer.squareup.com/reference/square/enums/TenderBankAccountDetailsStatus
 */
function squareDetailStatus(details: unknown): string | undefined {
  if (details == null || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }
  const st = (details as Record<string, unknown>).status;
  if (typeof st !== "string") return undefined;
  const u = st.trim().toUpperCase();
  return u === "" ? undefined : u;
}

/** Card-like tenders: FAILED / VOIDED are not successful; AUTHORIZED / CAPTURED (and unknown) count as paid attempt. */
function squareCardLikeTenderSuccessful(tender: Record<string, unknown>): boolean {
  const cd = tender.card_details;
  if (cd == null || typeof cd !== "object" || Array.isArray(cd)) return true;
  const st = squareDetailStatus(cd);
  if (st == null) return true;
  return st !== "FAILED" && st !== "VOIDED";
}

function squareBankAccountTenderSuccessful(tender: Record<string, unknown>): boolean {
  const st = squareDetailStatus(tender.bank_account_details);
  if (st == null) return false;
  return st === "COMPLETED";
}

/** BNPL, Square Account, and digital wallet share AUTHORIZED / CAPTURED / FAILED / VOIDED. */
function squareCardLikeStatusDetailSuccessful(details: unknown): boolean {
  const st = squareDetailStatus(details);
  if (st == null) return true;
  return st !== "FAILED" && st !== "VOIDED";
}

function squareTenderHasExplicitFailureInKnownDetails(tender: Record<string, unknown>): boolean {
  const keys = [
    "card_details",
    "buy_now_pay_later_details",
    "square_account_details",
    "digital_wallet_details",
    "bank_account_details",
  ] as const;
  for (const key of keys) {
    const st = squareDetailStatus(tender[key]);
    if (st === "FAILED" || st === "VOIDED") return true;
  }
  return false;
}

/**
 * True if this tender counts as a successful payment for net-sales / dashboard purposes.
 */
export function squareTenderRepresentsSuccessfulPayment(tender: Record<string, unknown>): boolean {
  const typeRaw = tender.type;
  const type = typeof typeRaw === "string" ? typeRaw.trim().toUpperCase() : "";

  if (type === "CASH") return true;

  if (type === "NO_SALE") return false;

  if (
    type === "CARD" ||
    type === "THIRD_PARTY_CARD" ||
    type === "SQUARE_GIFT_CARD"
  ) {
    return squareCardLikeTenderSuccessful(tender);
  }

  if (type === "BUY_NOW_PAY_LATER") {
    return squareCardLikeStatusDetailSuccessful(tender.buy_now_pay_later_details);
  }

  if (type === "SQUARE_ACCOUNT") {
    return squareCardLikeStatusDetailSuccessful(tender.square_account_details);
  }

  if (type === "WALLET") {
    return squareCardLikeStatusDetailSuccessful(tender.digital_wallet_details);
  }

  if (type === "BANK_ACCOUNT") {
    return squareBankAccountTenderSuccessful(tender);
  }

  if (squareTenderHasExplicitFailureInKnownDetails(tender)) return false;
  return true;
}

/**
 * When `tenders` is non-empty, true if at least one tender is a successful payment
 * (cash, captured card, completed bank transfer, successful wallet/BNPL, etc.).
 */
export function squareTendersListHasSuccessfulPayment(tenders: unknown): boolean {
  if (!Array.isArray(tenders) || tenders.length === 0) return false;
  for (const t of tenders) {
    if (t == null || typeof t !== "object" || Array.isArray(t)) continue;
    if (squareTenderRepresentsSuccessfulPayment(t as Record<string, unknown>)) return true;
  }
  return false;
}

/**
 * True when the order has a non-empty `tenders` array and none of them represent a successful payment
 * (e.g. OPEN order after a declined card, failed wallet, failed BNPL, or failed bank debit).
 * Orders with only `payment_ids` and no tender bodies are not excluded here.
 */
export function isSquareOrderOnlyUnsuccessfulPaymentTenders(order: {
  tenders?: unknown;
}): boolean {
  const tenders = order.tenders;
  if (!Array.isArray(tenders) || tenders.length === 0) return false;
  return !squareTendersListHasSuccessfulPayment(tenders);
}

/** @deprecated Use {@link isSquareOrderOnlyUnsuccessfulPaymentTenders} — behavior now covers all tender types. */
export const isSquareOrderOnlyFailedCardPayments = isSquareOrderOnlyUnsuccessfulPaymentTenders;

/** Mongo `raw` or nested `raw.order` with tenders present but no successful payment. */
export function isRawSquareOrderOnlyUnsuccessfulPaymentTenders(
  raw: Record<string, unknown>,
): boolean {
  if (isSquareOrderOnlyUnsuccessfulPaymentTenders(raw)) return true;
  const nested = raw.order;
  if (nested != null && typeof nested === "object" && !Array.isArray(nested)) {
    return isSquareOrderOnlyUnsuccessfulPaymentTenders(nested as Record<string, unknown>);
  }
  return false;
}

/** @deprecated Use {@link isRawSquareOrderOnlyUnsuccessfulPaymentTenders}. */
export const isRawSquareOrderOnlyFailedCardPayments =
  isRawSquareOrderOnlyUnsuccessfulPaymentTenders;

/**
 * Single gate for dashboard lists and metrics: canceled orders and payment-failure-only orders.
 * Invalid / non-object payloads are treated as excluded (dropped by {@link filterSquareOrdersForDashboardDisplay}).
 */
export function isSquareOrderExcludedFromDashboardDisplay(order: unknown): boolean {
  if (order == null || typeof order !== "object" || Array.isArray(order)) return true;
  const o = order as Record<string, unknown>;
  if (isSquareOrderStateCanceled(getSquareOrderStateFromPayload(o))) return true;
  if (isSquareOrderOnlyUnsuccessfulPaymentTenders(o)) return true;
  return false;
}

/** Mongo `raw` row should not feed dashboard order metrics or activity. */
export function isRawSquareOrderExcludedFromDashboardDisplay(
  raw: Record<string, unknown>,
): boolean {
  return (
    isRawSquareOrderCanceled(raw) || isRawSquareOrderOnlyUnsuccessfulPaymentTenders(raw)
  );
}

/** Drop orders excluded from dashboard (canceled, unsuccessful-payment-only). Safe for any order-shaped array. */
export function filterSquareOrdersForDashboardDisplay<T>(orders: readonly T[]): T[] {
  return orders.filter((o) => !isSquareOrderExcludedFromDashboardDisplay(o));
}
