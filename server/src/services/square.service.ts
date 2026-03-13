import type {
  SquareLocationForHours,
  TimeRange,
} from "../utils/businessHours.util.js";
import { generateDistinctColors } from "../utils/colorPalette.util.js";
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
  getOrderedBucketsAndLabels,
  getBucketKeyForDate,
  type SalesTrendGranularity,
} from "../utils/homebaseOrderedBuckets.util.js";

const SQUARE_BASE = "https://connect.squareup.com";

export type { TimeRange } from "../utils/businessHours.util.js";

interface Money {
  amount?: bigint | number | string;
  currency?: string;
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
  catalog_object_id?: string;
  total_money?: Money;
  quantity?: string;
}

interface SquareOrder {
  created_at?: string;
  /** Order state (e.g. OPEN, COMPLETED, CANCELED). CANCELED orders are excluded from net sales. */
  state?: string;
  total_money?: Money;
  net_amounts?: NetAmounts;
  /** Refund/return amounts for the order (Square Order.return_amounts). */
  return_amounts?: OrderMoneyAmounts;
  /** Refund transactions on this order (Square Order.refunds). */
  refunds?: unknown[];
  /** Tenders that were used to pay (Square returns this array). */
  tenders?: unknown[];
  tender_ids?: string[];
  payment_ids?: string[];
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

/**
 * Fetch a single Square location by ID (GET /v2/locations/{location_id}).
 * Used to get business_hours and timezone for the selected store.
 */
export async function getSquareLocation(
  squareLocationId: string,
  options?: SquareServiceOptions,
): Promise<SquareLocationForHours | null> {
  const token = resolveAccessToken(options?.accessToken);
  const res = await fetch(
    `${SQUARE_BASE}/v2/locations/${encodeURIComponent(squareLocationId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    const errText = await res.text();
    throw new Error(`Square API error ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as SquareLocationResponse;
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.detail ?? e.code).join("; "));
  }
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

function isPaidOrder(order: SquareOrder): boolean {
  return (
    (order.tenders?.length ?? 0) > 0 ||
    (order.tender_ids?.length ?? 0) > 0 ||
    (order.payment_ids?.length ?? 0) > 0
  );
}

/**
 * True if order is paid and not CANCELED; use for net sales and discount/refund aggregation.
 * For transaction/order count we only include orders with positive net sales (see orderCount and countByKey below).
 */
function isOrderCountedForNetSales(order: SquareOrder): boolean {
  return isPaidOrder(order) && order.state !== "CANCELED";
}

/**
 * Per-order net sales in cents (Gross - Returns - Discounts, excluding tax, tips, card surcharge).
 * Returns 0 if order has no net_amounts or total_money; otherwise total_money - tax - tip - card_surcharge, clamped to >= 0.
 */
function orderNetSalesCents(order: SquareOrder): number {
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
async function fetchOrdersInRange(
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

    const res = await fetch(`${SQUARE_BASE}/v2/orders/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Square API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as SearchOrdersResponse;
    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors.map((e) => e.detail ?? e.code).join("; "));
    }

    const orders = data.orders ?? [];
    all.push(...orders);
    cursor = data.cursor;
  } while (cursor);

  return all;
}

/**
 * Aggregate order stats from an array of orders (same logic as getOrderStatsInRange).
 */
function getOrderStatsFromOrders(orders: SquareOrder[]): OrderStatsInRange {
  const stats: OrderStatsInRange = {
    orderCount: 0,
    netSalesCents: 0,
    totalDiscountCents: 0,
    totalRefundCents: 0,
    refundCount: 0,
  };

  for (const order of orders) {
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

const SOURCE_LABEL_MAP: Record<string, string> = {
  "square point of sale": "In-Store",
  "square for restaurants": "In-Store",
  "square pos": "In-Store",
  pos: "In-Store",
  pickup: "Pickup",
  delivery: "Delivery",
  shipment: "Shipment",
  kiosk: "Kiosk",
  doordash: "DoorDash",
  grubhub: "GrubHub",
  "grub hub": "GrubHub",
  other: "Other",
  "in-store": "In-Store",
  simple: "Order",
  order: "Order",
};

function deriveSegmentKey(order: SquareOrder): string {
  const sourceName = (order.source?.name ?? "").trim().toLowerCase();
  const fulfillmentType = order.fulfillments?.[0]?.type?.trim().toLowerCase();

  if (sourceName) {
    const mapped = SOURCE_LABEL_MAP[sourceName];
    if (mapped) return mapped.toLowerCase().replaceAll(/\s+/g, "-");
    return sourceName.replaceAll(/\s+/g, "-").replaceAll(/[^a-z0-9-]/g, "");
  }
  if (fulfillmentType) {
    const mapped = SOURCE_LABEL_MAP[fulfillmentType];
    if (mapped) return mapped.toLowerCase().replaceAll(/\s+/g, "-");
    return fulfillmentType;
  }
  return "order";
}

function segmentKeyToLabel(key: string): string {
  const normalized = key.toLowerCase().replaceAll(/\s+/g, "-");
  return (
    SOURCE_LABEL_MAP[normalized] ??
    key.replaceAll("-", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Aggregate net sales by source/fulfillment from an array of orders.
 * Returns segments with id, label, value (percentage 0-100), amount (formatted), color.
 */
function getSourcesOfSalesFromOrders(
  orders: SquareOrder[],
): SourcesOfSalesSegment[] {
  const byKey: Record<string, number> = {};

  for (const order of orders) {
    if (!isOrderCountedForNetSales(order)) continue;
    const cents = orderNetSalesCents(order);
    if (cents <= 0) continue;
    const key = deriveSegmentKey(order);
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

    const res = await fetch(`${SQUARE_BASE}/v2/orders/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Square API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as SearchOrdersResponse;
    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors.map((e) => e.detail ?? e.code).join("; "));
    }

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

    const res = await fetch(`${SQUARE_BASE}/v2/orders/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Square API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as SearchOrdersResponse;
    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors.map((e) => e.detail ?? e.code).join("; "));
    }

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
  const res = await fetch(`${SQUARE_BASE}/v2/catalog/batch-retrieve`, {
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
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Square Catalog API error ${res.status}: ${errText}`);
  }
  const data = (await res.json()) as BatchRetrieveCatalogResponse;
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.detail ?? e.code).join("; "));
  }
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
  const orders = await fetchOrdersInRange(
    squareLocationId,
    range,
    options?.accessToken,
  );

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

  const { variationToItemId, itemIdToCategoryId } =
    await resolveVariationToItemAndCategoryIds(
      variationIds,
      batchRetrieveCatalog as BatchRetrieveCatalogFn,
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
    batchRetrieveCatalog as BatchRetrieveCatalogFn,
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
  const { keys, labels } = getOrderedBucketsAndLabels(
    range,
    timezone,
    granularity,
    options?.periodType == null ? undefined : { periodType: options.periodType },
  );
  const netSalesByKey: Record<string, number> = {};
  const countByKey: Record<string, number> = {};
  for (const k of keys) {
    netSalesByKey[k] = 0;
    countByKey[k] = 0;
  }

  const orders = await fetchOrdersInRange(
    squareLocationId,
    range,
    options?.accessToken,
  );
  for (const order of orders) {
    if (!isOrderCountedForNetSales(order)) continue;
    const netCents = orderNetSalesCents(order);
    const key = getBucketKeyForDate(
      new Date(order.created_at ?? ""),
      timezone,
      granularity,
    );
    if (!key || netSalesByKey[key] === undefined) continue;
    netSalesByKey[key] = (netSalesByKey[key] ?? 0) + netCents / 100;
    // Transaction count = orders with positive net sales (matches Square "Net sales" order count).
    if (netCents > 0) countByKey[key] = (countByKey[key] ?? 0) + 1;
  }

  const netSales = keys.map((k) => netSalesByKey[k] ?? 0);
  const transactionCount = keys.map((k) => countByKey[k] ?? 0);
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
  const { keys, labels } = getOrderedBucketsAndLabels(
    range,
    timezone,
    granularity,
    options?.periodType == null ? undefined : { periodType: options.periodType },
  );
  const bySourceAndKey: Record<string, Record<string, number>> = {};

  const orders = await fetchOrdersInRange(
    squareLocationId,
    range,
    options?.accessToken,
  );
  for (const order of orders) {
    if (!isOrderCountedForNetSales(order)) continue;
    const cents = orderNetSalesCents(order);
    if (cents <= 0) continue;
    const sourceKey = deriveSegmentKey(order);
    const bucketKey = getBucketKeyForDate(
      new Date(order.created_at ?? ""),
      timezone,
      granularity,
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

  return { labels, series };
}
