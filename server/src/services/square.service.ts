import type {
  SquareLocationForHours,
  TimeRange,
} from "../utils/businessHours.util.js";

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

interface SquareOrder {
  created_at?: string;
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

/**
 * Fetch a single Square location by ID (GET /v2/locations/{location_id}).
 * Used to get business_hours and timezone for the selected store.
 */
export async function getSquareLocation(
  squareLocationId: string,
): Promise<SquareLocationForHours | null> {
  const token = getAccessToken();
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
 * Per-order net sales in cents (Gross - Returns - Discounts, excluding tax, tips, service charge, card surcharge).
 * Returns 0 if order has no net_amounts or total_money; otherwise total_money - tax - tip - service_charge - card_surcharge, clamped to >= 0.
 */
function orderNetSalesCents(order: SquareOrder): number {
  const net = order.net_amounts;
  if (net?.total_money?.amount == null) return 0;
  const total = moneyToCents(net.total_money);
  const tax = moneyToCents(net.tax_money);
  const tip = moneyToCents(net.tip_money);
  const serviceCharge = moneyToCents(net.service_charge_money);
  const cardSurcharge = moneyToCents(net.card_surcharge_money);
  // return Math.max(0, total - tax - tip - serviceCharge - cardSurcharge);
  return Math.max(0, total - tax - tip - cardSurcharge); //Do not include service charge for now
}

/**
 * Shared SearchOrders pagination: fetches all orders in the given location and created_at range.
 * Used so we can run both order stats and sources-of-sales aggregation in one pass.
 */
async function fetchOrdersInRange(
  squareLocationId: string,
  range: TimeRange,
): Promise<SquareOrder[]> {
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
        Authorization: `Bearer ${getAccessToken()}`,
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
    const isPaid = isPaidOrder(order);
    const refundCents = moneyToCents(order.return_amounts?.total_money);
    const hasRefunds = refundCents > 0;

    if (isPaid) {
      stats.orderCount += 1;
      stats.netSalesCents += orderNetSalesCents(order);
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

/**
 * Sources of Sales chart palette: no repeated colors.
 * First 11 = KPI card accent colors (green, gold, blue, orange, purple, red, yellow, gray, azure, positive, negative).
 * Next 9 = extra distinct colors for additional segments.
 */
const SOURCES_CHART_PALETTE: string[] = [
  "#5DC54F",   // green
  "#FDB90E",   // gold
  "#009BBE",   // blue
  "#F59E0B",   // orange
  "#BE68FF",   // purple
  "#FF1C28",   // red
  "#FFFF00",   // yellow
  "#6D6D6D",   // gray
  "#79AFFF",   // azure
  "#22C55E",   // positive (green)
  "#EF4444",   // negative (red)
  "#00BCD4",   // cyan
  "#E91E63",   // pink
  "#9C27B0",   // deep purple
  "#3F51B5",   // indigo
  "#009688",   // teal
  "#8BC34A",   // light green
  "#FF9800",   // amber
  "#795548",   // brown
  "#607D8B",   // blue grey
];

function deriveSegmentKey(order: SquareOrder): string {
  const sourceName = (order.source?.name ?? "").trim().toLowerCase();
  const fulfillmentType = order.fulfillments?.[0]?.type?.trim().toLowerCase();

  if (sourceName) {
    const mapped = SOURCE_LABEL_MAP[sourceName];
    if (mapped) return mapped.toLowerCase().replace(/\s+/g, "-");
    return sourceName.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }
  if (fulfillmentType) {
    const mapped = SOURCE_LABEL_MAP[fulfillmentType];
    if (mapped) return mapped.toLowerCase().replace(/\s+/g, "-");
    return fulfillmentType;
  }
  return "order";
}

function segmentKeyToLabel(key: string): string {
  const normalized = key.toLowerCase().replace(/\s+/g, "-");
  return SOURCE_LABEL_MAP[normalized] ?? key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function segmentColorByIndex(index: number): string {
  return SOURCES_CHART_PALETTE[index % SOURCES_CHART_PALETTE.length] ?? "#6D6D6D";
}

/**
 * Aggregate net sales by source/fulfillment from an array of orders.
 * Returns segments with id, label, value (percentage 0-100), amount (formatted), color.
 */
function getSourcesOfSalesFromOrders(orders: SquareOrder[]): SourcesOfSalesSegment[] {
  const byKey: Record<string, number> = {};

  for (const order of orders) {
    if (!isPaidOrder(order)) continue;
    const cents = orderNetSalesCents(order);
    if (cents <= 0) continue;
    const key = deriveSegmentKey(order);
    byKey[key] = (byKey[key] ?? 0) + cents;
  }

  const totalCents = Object.values(byKey).reduce((a, b) => a + b, 0);
  if (totalCents <= 0) return [];

  const keys = Object.keys(byKey).sort((a, b) => a.localeCompare(b));
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
      color: segmentColorByIndex(index),
    };
  });
}

/**
 * Fetch sources-of-sales segments for the given location and range.
 */
export async function getSourcesOfSalesInRange(
  squareLocationId: string,
  range: TimeRange,
): Promise<SourcesOfSalesSegment[]> {
  getAccessToken();
  const orders = await fetchOrdersInRange(squareLocationId, range);
  return getSourcesOfSalesFromOrders(orders);
}

/**
 * Fetch net sales for the given Square location in the given time range.
 * Filters by created_at; sort CREATED_AT DESC. Includes only orders with tenders, tender_ids, or payment_ids (paid). Net sales = sum of (total_money - tax - tip - service_charge - card_surcharge) per order. Returns dollars.
 */
export async function getNetSalesInRange(
  squareLocationId: string,
  range: TimeRange,
): Promise<number> {
  getAccessToken();
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
        Authorization: `Bearer ${getAccessToken()}`,
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
      if (!isPaidOrder(order)) continue;
      totalCents += orderNetSalesCents(order);
    }

    cursor = data.cursor;
  } while (cursor);

  return totalCents / 100;
}

export interface OrderInRange {
  created_at: string;
  amountCents: number;
}

/**
 * Fetch all paid orders in the given time range with created_at and net sales (cents).
 * Same filter and pagination as getNetSalesInRange; returns per-order data for bucketing.
 */
export async function searchOrdersInRange(
  squareLocationId: string,
  range: TimeRange,
): Promise<OrderInRange[]> {
  getAccessToken();
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
        Authorization: `Bearer ${getAccessToken()}`,
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
      if (!isPaidOrder(order)) continue;
      const created_at = order.created_at ?? "";
      if (!created_at) continue;
      result.push({
        created_at,
        amountCents: orderNetSalesCents(order),
      });
    }

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
): Promise<OrderStatsInRange> {
  getAccessToken();
  const orders = await fetchOrdersInRange(squareLocationId, range);
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
): Promise<OrderStatsAndSourcesResult> {
  getAccessToken();
  const orders = await fetchOrdersInRange(squareLocationId, range);
  return {
    orderStats: getOrderStatsFromOrders(orders),
    sourcesOfSales: getSourcesOfSalesFromOrders(orders),
  };
}
