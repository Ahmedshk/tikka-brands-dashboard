import type {
  SquareLocationForHours,
  TimeRange,
} from "../utils/businessHours.util.js";
import {
  aggregateVariationCentsFromOrders,
  buildCategoriesList,
  resolveCategoryIdToName,
  resolveVariationToItemAndCategoryIds,
  type BatchRetrieveCatalogFn,
  type NetSalesByCategoryResult,
} from "../utils/squareNetSalesByCategoryHelpers.js";
import {
  ordersFromSearchPage,
  type OrderInRange,
} from "../utils/squareOrderSearchHelpers.js";
import {
  getSquareOrderStateFromPayload,
  isSquareOrderStateCanceled,
  filterSquareOrdersForDashboardDisplay,
  squareTendersListHasSuccessfulPayment,
} from "../utils/squareOrderCacheHelpers.js";
import { normalizeSourcesOfSalesSegmentId } from "../utils/squareSourcesOfSalesMerge.util.js";
import {
  getOrderedBucketsAndLabels,
  getBucketKeyForDate,
  type SalesTrendGranularity,
} from "../utils/homebaseOrderedBuckets.util.js";
import {
  logExternalApiResult,
  truncateForExternalApiLog,
} from "../utils/externalApiCallLog.util.js";
import { logger } from "../utils/logger.util.js";
import {
  deriveSquareSourcesOfSalesKey,
  normalizeTrendSourceKey,
  segmentKeyToLabel,
} from "../utils/squareSourcesOfSalesKey.util.js";
import { generateDistinctColors } from "../utils/colorPalette.util.js";
import {
  tryGetOrderTimeSeriesBySourceFromRollups,
  tryGetOrderTimeSeriesFromRollups,
} from "./integrationRollupRead.service.js";

const SQUARE_BASE = "https://connect.squareup.com";

export type { TimeRange } from "../utils/businessHours.util.js";

interface Money {
  amount?: bigint | number | string;
  currency?: string;
}

export interface SquareOrderDiscount {
  name?: string;
  percentage?: string;
  amountMoneyCents?: number;
}

export interface SquareOrderWithDiscount {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
  paymentIds: string[];
  discounts: SquareOrderDiscount[];
  lineItems: {
    name: string;
    variationName?: string;
    quantity?: string;
    unitPriceMoneyCents?: number;
    grossSalesMoneyCents?: number;
    totalMoneyCents?: number;
    modifiers: {
      name: string;
      quantity?: string;
      unitPriceMoneyCents?: number;
      totalPriceMoneyCents?: number;
    }[];
  }[];
  orderTotals: {
    totalMoneyCents?: number;
    taxMoneyCents?: number;
    tipMoneyCents?: number;
    serviceChargeMoneyCents?: number;
    /** Order-level discount (Square net_amounts.discount_money or total_discount_money). */
    discountMoneyCents?: number;
  };
  refunds: {
    tenderId: string | null;
    refundCreatedAt: string | null;
    lineItems: {
      name: string;
      variationName?: string;
      quantity?: string;
      unitPriceMoneyCents?: number;
      lineTotalMoneyCents?: number;
      grossReturnMoneyCents?: number;
      modifiers: {
        name: string;
        quantity?: string;
        unitPriceMoneyCents?: number;
        totalPriceMoneyCents?: number;
      }[];
    }[];
    refundAmountMoneyCents?: number;
    taxMoneyCents?: number;
    tipMoneyCents?: number;
    serviceChargeMoneyCents?: number;
  }[];
}

export interface SquarePaymentDetails {
  id: string;
  employeeId: string | null;
  teamMemberId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  amountMoneyCents?: number;
  tipMoneyCents?: number;
  receiptNumber: string | null;
  receiptUrl: string | null;
  deviceName: string | null;
}

export interface SquareTeamMemberDetails {
  id: string;
  givenName: string | null;
  familyName: string | null;
  /** From wage_setting.job_assignments[0].job_title when present. */
  jobTitle?: string;
}

interface NetAmounts {
  total_money?: Money;
  tax_money?: Money;
  tip_money?: Money;
  service_charge_money?: Money;
  card_surcharge_money?: Money;
  /** Discounts are already reflected in total_money; not subtracted again. */
  discount_money?: Money;
}

/** Order-level return amounts (Square Order.return_amounts). */
interface OrderMoneyAmounts {
  total_money?: Money;
  [key: string]: unknown;
}

/** Line item for sales-by-category (Square OrderLineItem). */
interface SquareOrderLineItem {
  name?: string;
  variation_name?: string;
  catalog_object_id?: string;
  base_price_money?: Money;
  gross_sales_money?: Money;
  total_money?: Money;
  quantity?: string;
  modifiers?: Array<{
    name?: string;
    quantity?: string;
    base_price_money?: Money;
    total_price_money?: Money;
  }>;
}

export interface SquareOrder {
  id?: string;
  created_at?: string;
  updated_at?: string;
  /** Order state (e.g. OPEN, COMPLETED, CANCELED). CANCELED is excluded from net sales (see `isOrderCountedForNetSales`). */
  state?: string;
  total_money?: Money;
  total_discount_money?: Money;
  net_amounts?: NetAmounts;
  /** Refund/return amounts for the order (Square Order.return_amounts). */
  return_amounts?: OrderMoneyAmounts;
  /** Refund transactions on this order (Square Order.refunds). */
  refunds?: Array<{
    tender_id?: string;
    created_at?: string;
  }>;
  /** Tenders that were used to pay (Square returns this array). */
  tenders?: Array<{ payment_id?: string }>;
  tender_ids?: string[];
  payment_ids?: string[];
  discounts?: Array<{
    name?: string;
    percentage?: string;
    amount_money?: Money;
    applied_money?: Money;
  }>;
  returns?: Array<{
    return_line_items?: Array<{
      name?: string;
      variation_name?: string;
      quantity?: string;
      base_price_money?: Money;
      total_money?: Money;
      gross_return_money?: Money;
      return_modifiers?: Array<{
        name?: string;
        quantity?: string;
        base_price_money?: Money;
        total_price_money?: Money;
      }>;
    }>;
    return_amounts?: {
      total_money?: Money;
      tax_money?: Money;
      tip_money?: Money;
      service_charge_money?: Money;
    };
  }>;
  /** Origination of the order (Square Order.source). */
  source?: { name?: string };
  /** Fulfillment details (Square Order.fulfillments). */
  fulfillments?: Array<{ type?: string }>;
  /** Line items (included in SearchOrders response). */
  line_items?: SquareOrderLineItem[];
}

interface SearchOrdersResponse {
  orders?: SquareOrder[];
  cursor?: string;
  errors?: Array<{ code: string; detail?: string }>;
}

interface RetrievePaymentResponse {
  payment?: {
    id?: string;
    employee_id?: string;
    team_member_id?: string;
    created_at?: string;
    updated_at?: string;
    amount_money?: Money;
    tip_money?: Money;
    receipt_number?: string;
    receipt_url?: string;
    device_details?: {
      device_name?: string;
    };
  };
  errors?: Array<{ code: string; detail?: string }>;
}

interface RetrieveTeamMemberResponse {
  team_member?: {
    id?: string;
    given_name?: string;
    family_name?: string;
    wage_setting?: {
      job_assignments?: Array<{ job_title?: string }>;
    };
  };
  errors?: Array<{ code: string; detail?: string }>;
}

interface SquareLocationResponse {
  location?: {
    id?: string;
    timezone?: string;
    business_hours?: SquareLocationForHours["business_hours"];
    [key: string]: unknown;
  };
  errors?: Array<{ code: string; detail?: string }>;
}

function getAccessToken(): string {
  const token = process.env.SQUARE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN is not configured");
  return token;
}

export interface SquareServiceOptions {
  accessToken?: string | undefined;
  /** Used for label formatting: last52weeks = month+year on all monthly; daily day-name when not today/last52weeks/thisYear */
  periodType?: string | undefined;
  /** Skip SearchOrders when provided (e.g. Mongo-backed orders). */
  ordersOverride?: SquareOrder[] | undefined;
  /** Resolve catalog chunks from DB or another source instead of Square batch-retrieve. */
  batchRetrieveCatalogOverride?: BatchRetrieveCatalogFn;
  /** Location business open time (HH:mm); aligns daily/weekly/monthly buckets with rollups. */
  businessStartTime?: string | undefined;
  /**
   * When set, attempt persisted rollups first for order time series (see ROLLUP_READ_ENABLED).
   * Mongo order load runs only on rollup miss when `ordersOverride` is not pre-provided.
   */
  rollupRead?: {
    locationMongoId: string;
    timezone: string;
    businessStartTime: string;
  };
}

function resolveAccessToken(override?: string): string {
  if (override != null && String(override).trim() !== "") {
    return String(override).trim();
  }
  return getAccessToken();
}

/** Minimal TeamMember shape for sync (Square POST /v2/team-members/search). */
export interface SquareTeamMember {
  id: string;
  given_name?: string;
  family_name?: string;
  email_address?: string;
  phone_number?: string;
  status?: string;
}

interface SearchTeamMembersResponse {
  team_members?: SquareTeamMember[];
  cursor?: string;
  errors?: Array<{ code: string; detail?: string }>;
}

/**
 * Search active team members for a Square location (POST /v2/team-members/search).
 * Requires EMPLOYEES_READ. Paginates and returns all ACTIVE members for the location.
 */
export async function searchTeamMembers(
  squareLocationId: string,
  options?: SquareServiceOptions,
): Promise<SquareTeamMember[]> {
  const token = resolveAccessToken(options?.accessToken);
  const all: SquareTeamMember[] = [];
  let cursor: string | undefined;
  do {
    const body: {
      query: { filter: { location_ids: string[]; status: string } };
      limit: number;
      cursor?: string;
    } = {
      query: {
        filter: {
          location_ids: [squareLocationId],
          status: "ACTIVE",
        },
      },
      limit: 200,
    };
    if (cursor) body.cursor = cursor;
    const res = await fetch(`${SQUARE_BASE}/v2/team-members/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Square Team API error ${res.status}: ${text}`);
    }
    const data = JSON.parse(text) as SearchTeamMembersResponse;
    if (data.errors?.length) {
      throw new Error(
        `Square Team API errors: ${data.errors.map((e) => e.detail ?? e.code).join(", ")}`,
      );
    }
    if (data.team_members?.length) all.push(...data.team_members);
    cursor = data.cursor;
  } while (cursor);
  return all;
}

export async function getPaymentById(
  paymentId: string,
  options?: SquareServiceOptions,
): Promise<SquarePaymentDetails | null> {
  const token = resolveAccessToken(options?.accessToken);
  const op = "GET /v2/payments/{id}";
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(
      `${SQUARE_BASE}/v2/payments/${encodeURIComponent(paymentId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch (e) {
    const durationMs = Date.now() - t0;
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      error: truncateForExternalApiLog(
        e instanceof Error ? e.message : String(e),
      ),
    });
    throw e;
  }
  const durationMs = Date.now() - t0;
  if (!res.ok) {
    if (res.status === 404) {
      logExternalApiResult("Square", op, {
        outcome: "ok",
        durationMs,
        httpStatus: 404,
        notFound: true,
      });
      return null;
    }
    const errText = await res.text();
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      error: truncateForExternalApiLog(errText),
    });
    throw new Error(`Square Payment API error ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as RetrievePaymentResponse;
  if (data.errors?.length) {
    const errMsg = data.errors.map((e) => e.detail ?? e.code).join("; ");
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      error: truncateForExternalApiLog(errMsg),
    });
    throw new Error(errMsg);
  }
  logExternalApiResult("Square", op, {
    outcome: "ok",
    durationMs,
    httpStatus: res.status,
  });
  const payment = data.payment;
  if (!payment?.id) return null;
  return {
    id: payment.id,
    employeeId: payment.employee_id ?? null,
    teamMemberId: payment.team_member_id ?? null,
    createdAt: payment.created_at ?? null,
    updatedAt: payment.updated_at ?? null,
    ...(payment.amount_money?.amount != null
      ? { amountMoneyCents: moneyToCents(payment.amount_money) }
      : {}),
    ...(payment.tip_money?.amount != null
      ? { tipMoneyCents: moneyToCents(payment.tip_money) }
      : {}),
    receiptNumber: payment.receipt_number ?? null,
    receiptUrl: payment.receipt_url ?? null,
    deviceName: payment.device_details?.device_name ?? null,
  };
}

export async function getTeamMemberById(
  teamMemberId: string,
  options?: SquareServiceOptions,
): Promise<SquareTeamMemberDetails | null> {
  const token = resolveAccessToken(options?.accessToken);
  const op = "GET /v2/team-members/{id}";
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(
      `${SQUARE_BASE}/v2/team-members/${encodeURIComponent(teamMemberId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch (e) {
    const durationMs = Date.now() - t0;
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      error: truncateForExternalApiLog(
        e instanceof Error ? e.message : String(e),
      ),
    });
    throw e;
  }
  const durationMs = Date.now() - t0;
  if (!res.ok) {
    if (res.status === 404) {
      logExternalApiResult("Square", op, {
        outcome: "ok",
        durationMs,
        httpStatus: 404,
        notFound: true,
      });
      return null;
    }
    const errText = await res.text();
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      error: truncateForExternalApiLog(errText),
    });
    throw new Error(`Square Team API error ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as RetrieveTeamMemberResponse;
  if (data.errors?.length) {
    const errMsg = data.errors.map((e) => e.detail ?? e.code).join("; ");
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      error: truncateForExternalApiLog(errMsg),
    });
    throw new Error(errMsg);
  }
  logExternalApiResult("Square", op, {
    outcome: "ok",
    durationMs,
    httpStatus: res.status,
  });
  const member = data.team_member;
  if (!member?.id) return null;
  const jobTitleRaw =
    member.wage_setting?.job_assignments?.[0]?.job_title?.trim();
  const jobTitle =
    jobTitleRaw && jobTitleRaw.length > 0 ? jobTitleRaw : undefined;
  return {
    id: member.id,
    givenName: member.given_name ?? null,
    familyName: member.family_name ?? null,
    ...(jobTitle != null ? { jobTitle } : {}),
  };
}

/**
 * Fetch a single Square location by ID (GET /v2/locations/{location_id}).
 * Used to get business_hours and timezone for the selected store.
 */
export async function getSquareLocation(
  squareLocationId: string,
  options?: SquareServiceOptions,
): Promise<SquareLocationForHours | null> {
  const token = resolveAccessToken(options?.accessToken);
  const op = "GET /v2/locations/{id}";
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(
      `${SQUARE_BASE}/v2/locations/${encodeURIComponent(squareLocationId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch (e) {
    const durationMs = Date.now() - t0;
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      error: truncateForExternalApiLog(
        e instanceof Error ? e.message : String(e),
      ),
    });
    throw e;
  }
  const durationMs = Date.now() - t0;
  if (!res.ok) {
    if (res.status === 404) {
      logExternalApiResult("Square", op, {
        outcome: "ok",
        durationMs,
        httpStatus: 404,
        notFound: true,
      });
      return null;
    }
    const errText = await res.text();
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      error: truncateForExternalApiLog(errText),
    });
    throw new Error(`Square API error ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as SquareLocationResponse;
  if (data.errors?.length) {
    const errMsg = data.errors.map((e) => e.detail ?? e.code).join("; ");
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      error: truncateForExternalApiLog(errMsg),
    });
    throw new Error(errMsg);
  }
  logExternalApiResult("Square", op, {
    outcome: "ok",
    durationMs,
    httpStatus: res.status,
  });
  const loc = data.location;
  if (!loc) return null;
  const result: SquareLocationForHours = {};
  if (loc.timezone != null) result.timezone = loc.timezone;
  if (loc.business_hours != null) result.business_hours = loc.business_hours;
  return result;
}

function moneyToCents(money: Money | undefined): number {
  if (money?.amount == null) return 0;
  const amount = Number(money.amount);
  return Number.isNaN(amount) ? 0 : amount;
}

function refundReturnModifierFromSquare(modifier: {
  name?: string;
  quantity?: string;
  base_price_money?: Money;
  total_price_money?: Money;
}): SquareOrderWithDiscount["refunds"][number]["lineItems"][number]["modifiers"][number] {
  const qty = modifier.quantity?.trim();
  return {
    name: modifier.name?.trim() || "Add-on",
    ...(qty !== "" && qty != null ? { quantity: modifier.quantity } : {}),
    ...(modifier.base_price_money?.amount != null
      ? { unitPriceMoneyCents: moneyToCents(modifier.base_price_money) }
      : {}),
    ...(modifier.total_price_money?.amount != null
      ? { totalPriceMoneyCents: moneyToCents(modifier.total_price_money) }
      : {}),
  };
}

function refundReturnLineItemFromSquare(lineItem: {
  name?: string;
  variation_name?: string;
  quantity?: string;
  base_price_money?: Money;
  total_money?: Money;
  gross_return_money?: Money;
  return_modifiers?: Array<{
    name?: string;
    quantity?: string;
    base_price_money?: Money;
    total_price_money?: Money;
  }>;
}): SquareOrderWithDiscount["refunds"][number]["lineItems"][number] {
  const variation = lineItem.variation_name?.trim();
  const qty = lineItem.quantity?.trim();
  return {
    name: lineItem.name?.trim() || "Item",
    ...(variation ? { variationName: variation } : {}),
    ...(qty !== "" && qty != null ? { quantity: lineItem.quantity } : {}),
    ...(lineItem.base_price_money?.amount != null
      ? { unitPriceMoneyCents: moneyToCents(lineItem.base_price_money) }
      : {}),
    ...(lineItem.total_money?.amount != null
      ? { lineTotalMoneyCents: moneyToCents(lineItem.total_money) }
      : {}),
    ...(lineItem.gross_return_money?.amount != null
      ? { grossReturnMoneyCents: moneyToCents(lineItem.gross_return_money) }
      : {}),
    modifiers: (lineItem.return_modifiers ?? []).map(refundReturnModifierFromSquare),
  };
}

function discountOrderLineItemFromSquare(lineItem: {
  name?: string;
  variation_name?: string;
  quantity?: string;
  base_price_money?: Money;
  gross_sales_money?: Money;
  total_money?: Money;
  modifiers?: Array<{
    name?: string;
    quantity?: string;
    base_price_money?: Money;
    total_price_money?: Money;
  }>;
}): SquareOrderWithDiscount["lineItems"][number] {
  const variation = lineItem.variation_name?.trim();
  const qty = lineItem.quantity?.trim();
  return {
    name: lineItem.name?.trim() || "Item",
    ...(variation ? { variationName: variation } : {}),
    ...(qty !== "" && qty != null ? { quantity: lineItem.quantity } : {}),
    ...(lineItem.base_price_money?.amount != null
      ? { unitPriceMoneyCents: moneyToCents(lineItem.base_price_money) }
      : {}),
    ...(lineItem.gross_sales_money?.amount != null
      ? { grossSalesMoneyCents: moneyToCents(lineItem.gross_sales_money) }
      : {}),
    ...(lineItem.total_money?.amount != null
      ? { totalMoneyCents: moneyToCents(lineItem.total_money) }
      : {}),
    modifiers: (lineItem.modifiers ?? []).map(refundReturnModifierFromSquare),
  };
}

function isPaidOrder(order: SquareOrder): boolean {
  const tenderList = order.tenders ?? [];
  if (tenderList.length > 0) {
    return squareTendersListHasSuccessfulPayment(tenderList);
  }
  return (
    (order.tender_ids?.length ?? 0) > 0 ||
    (order.payment_ids?.length ?? 0) > 0
  );
}

/**
 * True if order is paid (successful tender or ids-only) and not CANCELED; use for net sales and discount/refund aggregation.
 * CANCELED is excluded first so orders that still list tenders/payment_ids after cancel never count.
 * When `tenders[]` is present, only tenders that represent a successful payment count as paid (see
 * `squareTenderRepresentsSuccessfulPayment`: card/BNPL/wallet/Square Account/bank ACH statuses, cash, etc.).
 * Reads `state` from the order root, or nested `order` / `raw` (Mongo/sync shapes).
 * For transaction/order count we only include orders with positive net sales (see orderCount and countByKey below).
 */
export function isOrderCountedForNetSales(order: SquareOrder): boolean {
  const state = getSquareOrderStateFromPayload(order);
  if (isSquareOrderStateCanceled(state)) return false;
  return isPaidOrder(order);
}

/**
 * Per-order net sales in cents (Gross - Returns - Discounts, excluding tax, tips, card surcharge).
 * Returns 0 if order has no net_amounts or total_money; otherwise total_money - tax - tip - card_surcharge, clamped to >= 0.
 */
export function orderNetSalesCents(order: SquareOrder): number {
  const net = order.net_amounts;
  if (net?.total_money?.amount == null) return 0;
  const total = moneyToCents(net.total_money);
  const tax = moneyToCents(net.tax_money);
  const tip = moneyToCents(net.tip_money);
  const cardSurcharge = moneyToCents(net.card_surcharge_money);
  return Math.max(0, total - tax - tip - cardSurcharge);
}

/**
 * Shared SearchOrders pagination: fetches all orders in the given location and created_at range.
 * Used so we can run both order stats and sources-of-sales aggregation in one pass.
 */
export async function fetchOrdersInRange(
  squareLocationId: string,
  range: TimeRange,
  accessToken?: string,
): Promise<SquareOrder[]> {
  const token = resolveAccessToken(accessToken);
  const { startAt, endAt } = range;
  const all: SquareOrder[] = [];
  let cursor: string | undefined;

  do {
    const body: {
      location_ids: string[];
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: string; end_at: string };
          };
        };
        sort: { sort_field: string; sort_order?: string };
      };
      limit?: number;
      cursor?: string;
    } = {
      location_ids: [squareLocationId],
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: startAt, end_at: endAt },
          },
        },
        sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
      },
      limit: 500,
    };
    if (cursor) body.cursor = cursor;

    const op = "POST /v2/orders/search";
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${SQUARE_BASE}/v2/orders/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const durationMs = Date.now() - t0;
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        paginated: Boolean(cursor),
        source: "fetchOrdersInRange",
        error: truncateForExternalApiLog(
          e instanceof Error ? e.message : String(e),
        ),
      });
      throw e;
    }
    const durationMs = Date.now() - t0;

    if (!res.ok) {
      const errText = await res.text();
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        source: "fetchOrdersInRange",
        error: truncateForExternalApiLog(errText),
      });
      throw new Error(`Square API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as SearchOrdersResponse;
    if (data.errors && data.errors.length > 0) {
      const errMsg = data.errors.map((e) => e.detail ?? e.code).join("; ");
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        source: "fetchOrdersInRange",
        error: truncateForExternalApiLog(errMsg),
      });
      throw new Error(errMsg);
    }
    logExternalApiResult("Square", op, {
      outcome: "ok",
      durationMs,
      httpStatus: res.status,
      paginated: Boolean(cursor),
      source: "fetchOrdersInRange",
    });

    const orders = data.orders ?? [];
    all.push(...orders);
    cursor = data.cursor;
  } while (cursor);

  return all;
}

/** Map Square API orders to activity-log discount rows (same rules as search). */
export function squareOrdersToWithDiscounts(
  orders: SquareOrder[],
): SquareOrderWithDiscount[] {
  return filterSquareOrdersForDashboardDisplay(orders)
    .filter(
      (order) =>
        (order.discounts?.length ?? 0) > 0 || (order.returns?.length ?? 0) > 0,
    )
    .map((order) => {
      const tenderPaymentIds = (order.tenders ?? [])
        .map((tender) => tender.payment_id)
        .filter(
          (paymentId): paymentId is string =>
            paymentId != null && paymentId.trim() !== "",
        );
      const paymentIds = [
        ...new Set([...(order.payment_ids ?? []), ...tenderPaymentIds]),
      ];
      let orderLevelDiscountCents: number | undefined;
      if (order.net_amounts?.discount_money?.amount != null) {
        orderLevelDiscountCents = moneyToCents(order.net_amounts.discount_money);
      } else if (order.total_discount_money?.amount != null) {
        orderLevelDiscountCents = moneyToCents(order.total_discount_money);
      }
      const discounts: SquareOrderDiscount[] = (order.discounts ?? []).map(
        (discount) => {
          const amountMoneyCents =
            orderLevelDiscountCents ??
            (discount.amount_money?.amount == null &&
            discount.applied_money?.amount == null
              ? undefined
              : moneyToCents(discount.amount_money ?? discount.applied_money));
          const d: SquareOrderDiscount = {};
          if (discount.name != null) {
            d.name = discount.name;
          }
          if (discount.percentage != null) {
            d.percentage = discount.percentage;
          }
          if (amountMoneyCents != null) {
            d.amountMoneyCents = amountMoneyCents;
          }
          return d;
        },
      );
      const lineItems = (order.line_items ?? []).map(discountOrderLineItemFromSquare);
      const orderTotals: SquareOrderWithDiscount["orderTotals"] = {
        ...(order.net_amounts?.total_money?.amount != null
          ? { totalMoneyCents: moneyToCents(order.net_amounts.total_money) }
          : {}),
        ...(order.net_amounts?.tax_money?.amount != null
          ? { taxMoneyCents: moneyToCents(order.net_amounts.tax_money) }
          : {}),
        ...(order.net_amounts?.tip_money?.amount != null
          ? { tipMoneyCents: moneyToCents(order.net_amounts.tip_money) }
          : {}),
        ...(order.net_amounts?.service_charge_money?.amount != null
          ? {
              serviceChargeMoneyCents: moneyToCents(
                order.net_amounts.service_charge_money,
              ),
            }
          : {}),
        ...(orderLevelDiscountCents != null
          ? { discountMoneyCents: orderLevelDiscountCents }
          : {}),
      };
      const refundTenderId = order.refunds?.[0]?.tender_id ?? null;
      const refundCreatedAt = order.refunds?.[0]?.created_at ?? null;
      const refunds: SquareOrderWithDiscount["refunds"] = (order.returns ?? []).map(
        (returnEntry) => ({
          tenderId: refundTenderId,
          refundCreatedAt,
          lineItems: (returnEntry.return_line_items ?? []).map(
            refundReturnLineItemFromSquare,
          ),
          ...(returnEntry.return_amounts?.total_money?.amount != null
            ? {
                refundAmountMoneyCents: moneyToCents(
                  returnEntry.return_amounts.total_money,
                ),
              }
            : {}),
          ...(returnEntry.return_amounts?.tax_money?.amount != null
            ? {
                taxMoneyCents: moneyToCents(
                  returnEntry.return_amounts.tax_money,
                ),
              }
            : {}),
          ...(returnEntry.return_amounts?.tip_money?.amount != null
            ? {
                tipMoneyCents: moneyToCents(
                  returnEntry.return_amounts.tip_money,
                ),
              }
            : {}),
          ...(returnEntry.return_amounts?.service_charge_money?.amount != null
            ? {
                serviceChargeMoneyCents: moneyToCents(
                  returnEntry.return_amounts.service_charge_money,
                ),
              }
            : {}),
        }),
      );
      return {
        id: order.id ?? "",
        createdAt: order.created_at ?? null,
        updatedAt: order.updated_at ?? null,
        paymentIds,
        discounts,
        lineItems,
        orderTotals,
        refunds,
      };
    })
    .filter((order) => order.id.length > 0);
}

export async function searchOrdersWithDiscountsInRange(
  squareLocationId: string,
  range: TimeRange,
  options?: SquareServiceOptions,
): Promise<SquareOrderWithDiscount[]> {
  const orders = await fetchOrdersInRange(
    squareLocationId,
    range,
    options?.accessToken,
  );
  return squareOrdersToWithDiscounts(orders);
}

/**
 * Aggregate order stats from an array of orders (same logic as getOrderStatsInRange).
 */
export function getOrderStatsFromOrders(orders: SquareOrder[]): OrderStatsInRange {
  const stats: OrderStatsInRange = {
    orderCount: 0,
    netSalesCents: 0,
    totalDiscountCents: 0,
    totalRefundCents: 0,
    refundCount: 0,
  };

  for (const order of filterSquareOrdersForDashboardDisplay(orders)) {
    const countedForNetSales = isOrderCountedForNetSales(order);
    const netCents = orderNetSalesCents(order);
    const refundCents = moneyToCents(order.return_amounts?.total_money);
    const hasRefunds = refundCents > 0;

    if (countedForNetSales) {
      // Transaction count = orders with positive net sales (matches Square "Net sales" order count).
      if (netCents > 0) stats.orderCount += 1;
      stats.netSalesCents += netCents;
      stats.totalDiscountCents += moneyToCents(
        order.net_amounts?.discount_money,
      );
    }
    if (hasRefunds) {
      stats.totalRefundCents += refundCents;
      stats.refundCount += Array.isArray(order.refunds)
        ? order.refunds.length
        : 1;
    }
  }

  return stats;
}

export interface SourcesOfSalesSegment {
  id: string;
  label: string;
  value: number;
  amount: string;
  color: string;
}

/**
 * Aggregate net sales by source/fulfillment from an array of orders.
 * Returns segments with id, label, value (percentage 0-100), amount (formatted), color.
 */
export function getSourcesOfSalesFromOrders(
  orders: SquareOrder[],
): SourcesOfSalesSegment[] {
  const byKey: Record<string, number> = {};

  for (const order of filterSquareOrdersForDashboardDisplay(orders)) {
    if (!isOrderCountedForNetSales(order)) continue;
    const cents = orderNetSalesCents(order);
    if (cents <= 0) continue;
    const key = normalizeSourcesOfSalesSegmentId(deriveSquareSourcesOfSalesKey(order));
    byKey[key] = (byKey[key] ?? 0) + cents;
  }

  const totalCents = Object.values(byKey).reduce((a, b) => a + b, 0);
  if (totalCents <= 0) return [];

  const keys = Object.keys(byKey).sort((a, b) => a.localeCompare(b));
  const colors = generateDistinctColors(keys.length, { nonAdjacent: true });
  return keys.map((key, index) => {
    const amountCents = byKey[key] ?? 0;
    const value = Math.round((amountCents / totalCents) * 1000) / 10;
    const amountDollars = amountCents / 100;
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountDollars);
    return {
      id: key,
      label: segmentKeyToLabel(key),
      value,
      amount,
      color: colors[index] ?? "#6D6D6D",
    };
  });
}

/**
 * Fetch sources-of-sales segments for the given location and range.
 */
export async function getSourcesOfSalesInRange(
  squareLocationId: string,
  range: TimeRange,
  options?: SquareServiceOptions,
): Promise<SourcesOfSalesSegment[]> {
  const orders = await fetchOrdersInRange(
    squareLocationId,
    range,
    options?.accessToken,
  );
  return getSourcesOfSalesFromOrders(orders);
}

/**
 * Fetch net sales for the given Square location in the given time range.
 * Filters by created_at; sort CREATED_AT DESC. Includes only orders with tenders, tender_ids, or payment_ids (paid). Net sales = sum of (total_money - tax - tip - service_charge - card_surcharge) per order. Returns dollars.
 */
export async function getNetSalesInRange(
  squareLocationId: string,
  range: TimeRange,
  options?: SquareServiceOptions,
): Promise<number> {
  const token = resolveAccessToken(options?.accessToken);
  const { startAt, endAt } = range;

  let totalCents = 0;
  let cursor: string | undefined;

  do {
    const body: {
      location_ids: string[];
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: string; end_at: string };
          };
        };
        sort: { sort_field: string; sort_order?: string };
      };
      limit?: number;
      cursor?: string;
    } = {
      location_ids: [squareLocationId],
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: startAt, end_at: endAt },
          },
        },
        sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
      },
      limit: 500,
    };
    if (cursor) body.cursor = cursor;

    const op = "POST /v2/orders/search";
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${SQUARE_BASE}/v2/orders/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const durationMs = Date.now() - t0;
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        paginated: Boolean(cursor),
        source: "getNetSalesInRange",
        error: truncateForExternalApiLog(
          e instanceof Error ? e.message : String(e),
        ),
      });
      throw e;
    }
    const durationMs = Date.now() - t0;

    if (!res.ok) {
      const errText = await res.text();
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        source: "getNetSalesInRange",
        error: truncateForExternalApiLog(errText),
      });
      throw new Error(`Square API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as SearchOrdersResponse;
    if (data.errors && data.errors.length > 0) {
      const errMsg = data.errors.map((e) => e.detail ?? e.code).join("; ");
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        source: "getNetSalesInRange",
        error: truncateForExternalApiLog(errMsg),
      });
      throw new Error(errMsg);
    }
    logExternalApiResult("Square", op, {
      outcome: "ok",
      durationMs,
      httpStatus: res.status,
      paginated: Boolean(cursor),
      source: "getNetSalesInRange",
    });

    const orders = data.orders ?? [];
    for (const order of orders) {
      if (!isOrderCountedForNetSales(order)) continue;
      totalCents += orderNetSalesCents(order);
    }

    cursor = data.cursor;
  } while (cursor);

  return totalCents / 100;
}

export type { OrderInRange } from "../utils/squareOrderSearchHelpers.js";

/**
 * Fetch all paid orders in the given time range with created_at and net sales (cents).
 * Same filter and pagination as getNetSalesInRange; returns per-order data for bucketing.
 */
export async function searchOrdersInRange(
  squareLocationId: string,
  range: TimeRange,
  options?: SquareServiceOptions,
): Promise<OrderInRange[]> {
  const token = resolveAccessToken(options?.accessToken);
  const { startAt, endAt } = range;

  const result: OrderInRange[] = [];
  let cursor: string | undefined;

  do {
    const body: {
      location_ids: string[];
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: string; end_at: string };
          };
        };
        sort: { sort_field: string; sort_order?: string };
      };
      limit?: number;
      cursor?: string;
    } = {
      location_ids: [squareLocationId],
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: startAt, end_at: endAt },
          },
        },
        sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
      },
      limit: 500,
    };
    if (cursor) body.cursor = cursor;

    const op = "POST /v2/orders/search";
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${SQUARE_BASE}/v2/orders/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      const durationMs = Date.now() - t0;
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        paginated: Boolean(cursor),
        source: "searchOrdersInRange",
        error: truncateForExternalApiLog(
          e instanceof Error ? e.message : String(e),
        ),
      });
      throw e;
    }
    const durationMs = Date.now() - t0;

    if (!res.ok) {
      const errText = await res.text();
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        source: "searchOrdersInRange",
        error: truncateForExternalApiLog(errText),
      });
      throw new Error(`Square API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as SearchOrdersResponse;
    if (data.errors && data.errors.length > 0) {
      const errMsg = data.errors.map((e) => e.detail ?? e.code).join("; ");
      logExternalApiResult("Square", op, {
        outcome: "error",
        durationMs,
        httpStatus: res.status,
        paginated: Boolean(cursor),
        source: "searchOrdersInRange",
        error: truncateForExternalApiLog(errMsg),
      });
      throw new Error(errMsg);
    }
    logExternalApiResult("Square", op, {
      outcome: "ok",
      durationMs,
      httpStatus: res.status,
      paginated: Boolean(cursor),
      source: "searchOrdersInRange",
    });

    const pageOrders = ordersFromSearchPage(
      data.orders ?? [],
      isOrderCountedForNetSales as (o: unknown) => boolean,
      orderNetSalesCents as (o: unknown) => number,
    );
    result.push(...pageOrders);

    cursor = data.cursor;
  } while (cursor);

  return result;
}

export interface OrderStatsInRange {
  orderCount: number;
  netSalesCents: number;
  totalDiscountCents: number;
  totalRefundCents: number;
  refundCount: number;
}

/**
 * Aggregate order stats in range: count, net sales, total discounts, total refunds (all paid orders).
 * Uses shared fetchOrdersInRange + getOrderStatsFromOrders.
 */
export async function getOrderStatsInRange(
  squareLocationId: string,
  range: TimeRange,
  options?: SquareServiceOptions,
): Promise<OrderStatsInRange> {
  const orders = await fetchOrdersInRange(
    squareLocationId,
    range,
    options?.accessToken,
  );
  return getOrderStatsFromOrders(orders);
}

export interface OrderStatsAndSourcesResult {
  orderStats: OrderStatsInRange;
  sourcesOfSales: SourcesOfSalesSegment[];
}

/**
 * Fetch orders once and return both order stats and sources-of-sales segments (one SearchOrders flow).
 */
export async function getOrderStatsAndSourcesInRange(
  squareLocationId: string,
  range: TimeRange,
  options?: SquareServiceOptions,
): Promise<OrderStatsAndSourcesResult> {
  const orders = await fetchOrdersInRange(
    squareLocationId,
    range,
    options?.accessToken,
  );
  return {
    orderStats: getOrderStatsFromOrders(orders),
    sourcesOfSales: getSourcesOfSalesFromOrders(orders),
  };
}

const BATCH_RETRIEVE_CATALOG_LIMIT = 100;

/** Square CatalogObject shape for batch retrieve (minimal fields we need). */
interface CatalogObjectShape {
  type?: string;
  id?: string;
  item_variation_data?: { item_id?: string };
  item_data?: { category_id?: string };
  category_data?: { name?: string };
}

interface BatchRetrieveCatalogResponse {
  objects?: CatalogObjectShape[];
  related_objects?: CatalogObjectShape[];
  errors?: Array<{ code: string; detail?: string }>;
}

async function batchRetrieveCatalog(
  objectIds: string[],
  accessToken: string,
  includeRelated = false,
): Promise<BatchRetrieveCatalogResponse> {
  const op = "POST /v2/catalog/batch-retrieve";
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${SQUARE_BASE}/v2/catalog/batch-retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        object_ids: objectIds,
        include_related_objects: includeRelated,
      }),
    });
  } catch (e) {
    const durationMs = Date.now() - t0;
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      objectCount: objectIds.length,
      includeRelated,
      error: truncateForExternalApiLog(
        e instanceof Error ? e.message : String(e),
      ),
    });
    throw e;
  }
  const durationMs = Date.now() - t0;
  if (!res.ok) {
    const errText = await res.text();
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      objectCount: objectIds.length,
      includeRelated,
      error: truncateForExternalApiLog(errText),
    });
    throw new Error(`Square Catalog API error ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as BatchRetrieveCatalogResponse;
  if (data.errors?.length) {
    const errMsg = data.errors.map((e) => e.detail ?? e.code).join("; ");
    logExternalApiResult("Square", op, {
      outcome: "error",
      durationMs,
      httpStatus: res.status,
      objectCount: objectIds.length,
      includeRelated,
      error: truncateForExternalApiLog(errMsg),
    });
    throw new Error(errMsg);
  }
  logExternalApiResult("Square", op, {
    outcome: "ok",
    durationMs,
    httpStatus: res.status,
    objectCount: objectIds.length,
    includeRelated,
  });
  return data;
}

export type { NetSalesByCategoryResult } from "../utils/squareNetSalesByCategoryHelpers.js";

const UNCATEGORIZED_LABEL = "Uncategorized";

/**
 * Aggregate net sales by category for a time range using Square Orders (line items) and Catalog API.
 * Allocates order-level net sales to line items proportionally; resolves variation -> item -> category via BatchRetrieveCatalog.
 * Line items without catalog_object_id, or items whose category cannot be resolved, are grouped under "Uncategorized".
 */
export async function getNetSalesByCategoryInRange(
  squareLocationId: string,
  range: TimeRange,
  options?: SquareServiceOptions,
): Promise<NetSalesByCategoryResult> {
  const token = resolveAccessToken(options?.accessToken);
  const orders =
    options?.ordersOverride ??
    (await fetchOrdersInRange(
      squareLocationId,
      range,
      options?.accessToken,
    ));

  const { variationToCents, totalNetSalesCents, uncategorizedLineCents } =
    aggregateVariationCentsFromOrders(
      orders,
      isOrderCountedForNetSales as (o: unknown) => boolean,
      orderNetSalesCents as (o: unknown) => number,
      (line) => moneyToCents((line as { total_money?: Money }).total_money),
    );

  const variationIds = Object.keys(variationToCents);
  if (variationIds.length === 0) {
    if (uncategorizedLineCents > 0) {
      return {
        categories: [
          { name: UNCATEGORIZED_LABEL, netSalesCents: uncategorizedLineCents },
        ],
        totalNetSalesCents,
      };
    }
    return { categories: [], totalNetSalesCents };
  }

  const batchRetrieve: BatchRetrieveCatalogFn =
    options?.batchRetrieveCatalogOverride ??
    ((ids, tok, inc) => batchRetrieveCatalog(ids, tok, inc));

  const { variationToItemId, itemIdToCategoryId } =
    await resolveVariationToItemAndCategoryIds(
      variationIds,
      batchRetrieve,
      token,
      BATCH_RETRIEVE_CATALOG_LIMIT,
    );

  const categoryIds = [
    ...new Set(
      Object.values(variationToItemId)
        .map((itemId) => itemIdToCategoryId[itemId])
        .filter(Boolean),
    ),
  ] as string[];

  const categoryIdToName = await resolveCategoryIdToName(
    categoryIds,
    batchRetrieve,
    token,
    BATCH_RETRIEVE_CATALOG_LIMIT,
  );

  const categories = buildCategoriesList(
    variationToCents,
    variationToItemId,
    itemIdToCategoryId,
    categoryIdToName,
    uncategorizedLineCents,
    UNCATEGORIZED_LABEL,
  );

  return { categories, totalNetSalesCents };
}

export type { SalesTrendGranularity, GetOrderedBucketsAndLabelsOptions } from "../utils/homebaseOrderedBuckets.util.js";
export { getOrderedBucketsAndLabels } from "../utils/homebaseOrderedBuckets.util.js";

export interface OrderTimeSeriesResult {
  labels: string[];
  netSales: number[];
  transactionCount: number[];
}

/** Orders for dashboard time-series: explicit override, Mongo when `rollupRead`, else Square SearchOrders. */
async function resolveDashboardOrdersForRange(
  squareLocationId: string,
  range: TimeRange,
  options?: SquareServiceOptions,
  context: string,
): Promise<SquareOrder[]> {
  const t0 = performance.now();
  let raw: SquareOrder[];
  let source: "ordersOverride" | "mongo" | "square_api";
  if (options?.ordersOverride != null) {
    source = "ordersOverride";
    raw = options.ordersOverride;
  } else if (options?.rollupRead) {
    source = "mongo";
    const { loadSquareOrdersForMongoRange } = await import(
      "./integrationCacheRead.service.js"
    );
    raw = await loadSquareOrdersForMongoRange(
      options.rollupRead.locationMongoId,
      range,
    );
  } else {
    source = "square_api";
    raw = await fetchOrdersInRange(
      squareLocationId,
      range,
      options?.accessToken,
    );
  }
  const filtered = filterSquareOrdersForDashboardDisplay(raw);
  logger.info("[sales-trend] orders loaded for aggregation", {
    context,
    source,
    rawOrderCount: raw.length,
    filteredOrderCount: filtered.length,
    durationMs: Math.round(performance.now() - t0),
    rangeStart: range.startAt,
    rangeEnd: range.endAt,
  });
  return filtered;
}

/**
 * Fetch orders in range and aggregate by bucket (hour/day/week) in location TZ.
 * Returns labels and arrays aligned for chart x-axis.
 */
export async function getOrderTimeSeriesInRange(
  squareLocationId: string,
  range: TimeRange,
  timezone: string,
  granularity: SalesTrendGranularity,
  options?: SquareServiceOptions,
): Promise<OrderTimeSeriesResult> {
  const bucketLabelOpts =
    options?.periodType == null && options?.businessStartTime == null
      ? undefined
      : {
          periodType: options?.periodType,
          businessStartTime: options?.businessStartTime,
        };
  const { keys, labels } = getOrderedBucketsAndLabels(
    range,
    timezone,
    granularity,
    bucketLabelOpts,
  );
  const netSalesByKey: Record<string, number> = {};
  const countByKey: Record<string, number> = {};
  for (const k of keys) {
    netSalesByKey[k] = 0;
    countByKey[k] = 0;
  }

  const rr = options?.rollupRead;
  if (rr) {
    const tRollup = performance.now();
    const rolled = await tryGetOrderTimeSeriesFromRollups(
      rr.locationMongoId,
      range,
      rr.timezone,
      rr.businessStartTime,
      granularity,
      keys,
    );
    const rollupAttemptMs = Math.round(performance.now() - tRollup);
    if (rolled.hit) {
      logger.info("[sales-trend] getOrderTimeSeriesInRange: ROLLUPS", {
        granularity,
        bucketCount: keys.length,
        rollupAttemptMs,
        locationMongoId: rr.locationMongoId,
      });
      return {
        labels,
        netSales: rolled.netSales,
        transactionCount: rolled.transactionCount,
      };
    }
    logger.info("[sales-trend] getOrderTimeSeriesInRange: rollup miss → orders", {
      granularity,
      bucketCount: keys.length,
      rollupAttemptMs,
      locationMongoId: rr.locationMongoId,
      rollupMissCode: rolled.code,
      rollupMissReason: rolled.reason,
      rollupMissDetail: rolled.detail,
    });
  } else {
    logger.info("[sales-trend] getOrderTimeSeriesInRange: no rollupRead", {
      granularity,
      bucketCount: keys.length,
      willUseOrders:
        options?.ordersOverride != null ? "ordersOverride" : "square_api",
    });
  }

  const bucketOpts =
    options?.businessStartTime != null
      ? { businessStartTime: options.businessStartTime }
      : undefined;
  const tAggStart = performance.now();
  const orders = await resolveDashboardOrdersForRange(
    squareLocationId,
    range,
    options,
    "getOrderTimeSeriesInRange",
  );
  for (const order of orders) {
    if (!isOrderCountedForNetSales(order)) continue;
    const netCents = orderNetSalesCents(order);
    const key = getBucketKeyForDate(
      new Date(order.created_at ?? ""),
      timezone,
      granularity,
      bucketOpts,
    );
    if (!key || netSalesByKey[key] === undefined) continue;
    netSalesByKey[key] = (netSalesByKey[key] ?? 0) + netCents / 100;
    // Transaction count = orders with positive net sales (matches Square "Net sales" order count).
    if (netCents > 0) countByKey[key] = (countByKey[key] ?? 0) + 1;
  }

  const netSales = keys.map((k) => netSalesByKey[k] ?? 0);
  const transactionCount = keys.map((k) => countByKey[k] ?? 0);
  logger.info("[sales-trend] getOrderTimeSeriesInRange: aggregation done", {
    granularity,
    bucketCount: keys.length,
    ordersUsed: orders.length,
    aggregateTotalMs: Math.round(performance.now() - tAggStart),
  });
  return { labels, netSales, transactionCount };
}

export interface OrderTimeSeriesBySourceSeries {
  id: string;
  label: string;
  data: number[];
  color: string;
}

export interface OrderTimeSeriesBySourceResult {
  labels: string[];
  series: OrderTimeSeriesBySourceSeries[];
}

/**
 * Fetch orders in range and aggregate net sales by bucket and by source.
 * Returns labels and one series per source (In-Store, DoorDash, etc.) for stacked area chart.
 */
export async function getOrderTimeSeriesBySourceInRange(
  squareLocationId: string,
  range: TimeRange,
  timezone: string,
  granularity: SalesTrendGranularity,
  options?: SquareServiceOptions,
): Promise<OrderTimeSeriesBySourceResult> {
  const bucketLabelOpts =
    options?.periodType == null && options?.businessStartTime == null
      ? undefined
      : {
          periodType: options?.periodType,
          businessStartTime: options?.businessStartTime,
        };
  const { keys, labels } = getOrderedBucketsAndLabels(
    range,
    timezone,
    granularity,
    bucketLabelOpts,
  );
  const bySourceAndKey: Record<string, Record<string, number>> = {};

  const rr = options?.rollupRead;
  if (rr) {
    const tSrc = performance.now();
    const fromRollup = await tryGetOrderTimeSeriesBySourceFromRollups(
      rr.locationMongoId,
      range,
      rr.timezone,
      rr.businessStartTime,
      granularity,
      keys,
    );
    const rollupMs = Math.round(performance.now() - tSrc);
    if (fromRollup) {
      // Merge keys for trend display (e.g. In-Store + Pickup => Register).
      const mergedFromRollup: Record<string, Record<string, number>> = {};
      for (const [rawKey, record] of Object.entries(fromRollup)) {
        const key = normalizeTrendSourceKey(rawKey);
        mergedFromRollup[key] ??= {};
        for (const [bucketKey, value] of Object.entries(record ?? {})) {
          mergedFromRollup[key]![bucketKey] =
            (mergedFromRollup[key]![bucketKey] ?? 0) + (value ?? 0);
        }
      }
      const sourceKeys = Object.keys(mergedFromRollup).sort((a, b) =>
        a.localeCompare(b),
      );
      logger.info("[sales-trend] getOrderTimeSeriesBySourceInRange: ROLLUPS", {
        granularity,
        bucketCount: keys.length,
        sourceSeriesCount: sourceKeys.length,
        rollupAttemptMs: rollupMs,
        locationMongoId: rr.locationMongoId,
        dataSource: "rollups",
      });
      const colors = generateDistinctColors(sourceKeys.length, {
        nonAdjacent: true,
      });
      const series: OrderTimeSeriesBySourceSeries[] = sourceKeys.map(
        (sourceKey, index) => ({
          id: sourceKey,
          label: segmentKeyToLabel(sourceKey),
          data: keys.map((k) => mergedFromRollup[sourceKey]?.[k] ?? 0),
          color: colors[index] ?? "#6D6D6D",
        }),
      );
      return { labels, series };
    }
    logger.info(
      "[sales-trend] getOrderTimeSeriesBySourceInRange: rollup miss → orders",
      {
        granularity,
        bucketCount: keys.length,
        rollupAttemptMs: rollupMs,
        locationMongoId: rr.locationMongoId,
        dataSource: "mongo_orders_fallback",
        detail:
          "tryGetOrderTimeSeriesBySourceFromRollups returned null (missing/incomplete rollup rows, ROLLUP_READ_ENABLED off, or strict hourly pair mismatch)",
      },
    );
  } else if (!rr) {
    logger.info("[sales-trend] getOrderTimeSeriesBySourceInRange: no rollupRead", {
      granularity,
      bucketCount: keys.length,
      dataSource: "orders_only",
      willUseOrders:
        options?.ordersOverride != null ? "ordersOverride" : "square_api",
    });
  }

  const bucketOpts =
    options?.businessStartTime != null
      ? { businessStartTime: options.businessStartTime }
      : undefined;
  const tBySourceAgg = performance.now();
  const orders = await resolveDashboardOrdersForRange(
    squareLocationId,
    range,
    options,
    "getOrderTimeSeriesBySourceInRange",
  );
  for (const order of orders) {
    if (!isOrderCountedForNetSales(order)) continue;
    const cents = orderNetSalesCents(order);
    if (cents <= 0) continue;
    const sourceKey = normalizeTrendSourceKey(deriveSquareSourcesOfSalesKey(order));
    const bucketKey = getBucketKeyForDate(
      new Date(order.created_at ?? ""),
      timezone,
      granularity,
      bucketOpts,
    );
    if (!bucketKey || !keys.includes(bucketKey)) continue;
    bySourceAndKey[sourceKey] ??= {};
    const keyRecord = bySourceAndKey[sourceKey];
    keyRecord[bucketKey] = (keyRecord[bucketKey] ?? 0) + cents / 100;
  }

  const sourceKeys = Object.keys(bySourceAndKey).sort((a, b) =>
    a.localeCompare(b),
  );
  const colors = generateDistinctColors(sourceKeys.length, {
    nonAdjacent: true,
  });
  const series: OrderTimeSeriesBySourceSeries[] = sourceKeys.map(
    (sourceKey, index) => ({
      id: sourceKey,
      label: segmentKeyToLabel(sourceKey),
      data: keys.map((k) => bySourceAndKey[sourceKey]?.[k] ?? 0),
      color: colors[index] ?? "#6D6D6D",
    }),
  );

  logger.info(
    "[sales-trend] getOrderTimeSeriesBySourceInRange: aggregation done",
    {
      granularity,
      bucketCount: keys.length,
      ordersUsed: orders.length,
      sourceSeriesCount: sourceKeys.length,
      aggregateTotalMs: Math.round(performance.now() - tBySourceAgg),
      dataSource: rr ? "mongo_orders_fallback" : "orders_only",
    },
  );

  return { labels, series };
}
