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

interface SquareOrder {
  created_at?: string;
  total_money?: Money;
  net_amounts?: NetAmounts;
  /** Tenders that were used to pay (Square returns this array). */
  tenders?: unknown[];
  tender_ids?: string[];
  payment_ids?: string[];
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
  return Math.max(0, total - tax - tip - cardSurcharge);
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
