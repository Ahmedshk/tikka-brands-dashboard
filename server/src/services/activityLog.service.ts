import { LocationService } from "./location.service.js";
import {
  getSquarePaymentDetailsFromCache,
  getSquarePaymentDetailsBatchFromCache,
  getSquareTeamMemberRawFromCache,
  getSquareTeamMembersBatchFromCache,
  searchOrdersWithDiscountsFromCache,
} from "./integrationCacheRead.service.js";
import { upsertSquareTeamMember } from "./integrationCacheWrite.service.js";
import { getTeamMemberById } from "./square.service.js";
import { ValidationError } from "../utils/errors.util.js";
import { logger } from "../utils/logger.util.js";
import { getBusinessDayRangeForDate } from "../utils/timezone.util.js";
import type {
  ActivityLogListResult,
  ActivityLogRowDto,
} from "../types/activityLog.types.js";
import { buildActivityLogRowsForOrders, sortActivityLogRowsNewestFirst } from "../utils/activityLogRowsBuilder.util.js";

type PaymentDetails = Awaited<
  ReturnType<typeof getSquarePaymentDetailsFromCache>
>;
type TeamMemberDetails = {
  id?: string;
  givenName: string | null;
  familyName: string | null;
  jobTitle?: string;
} | null;

/**
 * Per-request caches shared across the all-locations fan-out so the same
 * payment / team member id is only resolved once per HTTP response. Values are
 * stored as Promises (not resolved values) so concurrent fan-out branches
 * waiting on the same in-flight lookup share the work instead of each
 * starting their own. Caches are short-lived (one HTTP request) — they never
 * cross request boundaries.
 */
export type ActivityLogPaymentCache = Map<string, Promise<PaymentDetails>>;
export type ActivityLogTeamMemberCache = Map<string, Promise<TeamMemberDetails>>;

export function createActivityLogCaches(): {
  paymentCache: ActivityLogPaymentCache;
  teamMemberCache: ActivityLogTeamMemberCache;
} {
  return {
    paymentCache: new Map(),
    teamMemberCache: new Map(),
  };
}
type ActivityOrder = Awaited<
  ReturnType<typeof searchOrdersWithDiscountsFromCache>
>[number];

function parseYmdDate(date: string): {
  year: number;
  month0: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const year = Number.parseInt(match?.[1] ?? "0", 10);
  const month0 = Number.parseInt(match?.[2] ?? "0", 10) - 1;
  const day = Number.parseInt(match?.[3] ?? "0", 10);
  if (
    !match ||
    Number.isNaN(year) ||
    Number.isNaN(month0) ||
    Number.isNaN(day)
  ) {
    throw new ValidationError("Date must be yyyy-MM-dd");
  }
  return { year, month0, day };
}

function formatDiscountLabel(discount: {
  name?: string;
  percentage?: string;
  amountMoneyCents?: number;
}): string {
  const name = discount.name?.trim();
  if (name) return name;
  const percentage = discount.percentage?.trim();
  if (percentage) return `${percentage}%`;
  if (discount.amountMoneyCents != null) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(discount.amountMoneyCents / 100);
  }
  return "Discount";
}

function formatDiscountAmount(amountMoneyCents: number | undefined): string {
  if (amountMoneyCents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMoneyCents / 100);
}

/** Discount row text before the trailing amount (for list badge split). */
function discountRowNameBase(
  discount: ActivityOrder["discounts"][number],
  order: ActivityOrder,
): string {
  const label = formatDiscountLabel(discount);
  const lineItemNames = order.lineItems
    .map((lineItem) => lineItem.name?.trim())
    .filter((n): n is string => Boolean(n && n.length > 0));
  const itemsStr = lineItemNames.join(", ");
  return itemsStr.length > 0 ? `${label} - ${itemsStr}` : label;
}

/** Full `name` plus optional `namePrefix` / `nameAmountBadgeText` for amount pill in the UI. */
function listNamePartsWithAmount(
  baseWithoutAmount: string,
  amountMoneyCents: number | undefined,
): {
  name: string;
  namePrefix?: string;
  nameAmountBadgeText?: string;
} {
  const amount = formatDiscountAmount(amountMoneyCents);
  if (amount === "—") {
    return { name: baseWithoutAmount };
  }
  return {
    name: `${baseWithoutAmount} - (${amount})`,
    namePrefix: baseWithoutAmount,
    nameAmountBadgeText: amount,
  };
}

function formatAppliedBy(
  givenName: string | null,
  familyName: string | null,
): string {
  const fullName = `${givenName ?? ""} ${familyName ?? ""}`.trim();
  return fullName || "Unknown";
}

function toDisplayAmount(amountMoneyCents: number | undefined): string {
  return formatDiscountAmount(amountMoneyCents);
}

/** Discount taken off the order (shown as negative in payment totals). */
function toDisplayDiscountMoney(amountMoneyCents: number | undefined): string {
  if (amountMoneyCents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(-amountMoneyCents / 100);
}

function formatLineItemUnitTimesQty(
  unitPriceCents: number | undefined,
  quantity: string | undefined,
): string | null {
  if (unitPriceCents == null) return null;
  const qty = quantity?.trim();
  if (!qty) return null;
  return `${toDisplayAmount(unitPriceCents)} × ${qty}`;
}

function computeLineBaseTotalCents(
  unitPriceCents: number | undefined,
  quantity: string | undefined,
): number | undefined {
  if (unitPriceCents == null) return undefined;
  const qtyNumber = Number(quantity);
  if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) return unitPriceCents;
  return Math.round(unitPriceCents * qtyNumber);
}

function calculateSubtotal(
  total?: number,
  tax?: number,
  tip?: number,
  serviceCharge?: number,
): number | undefined {
  if (total == null) return undefined;
  return total - (tax ?? 0) - (tip ?? 0) - (serviceCharge ?? 0);
}

/** Per-line gross before discounts; matches Square gross_sales_money with same fallbacks as the items list. */
function lineItemGrossSalesCents(
  lineItem: ActivityOrder["lineItems"][number],
): number | undefined {
  return (
    lineItem.grossSalesMoneyCents ??
    computeLineBaseTotalCents(
      lineItem.unitPriceMoneyCents,
      lineItem.quantity,
    ) ??
    lineItem.totalMoneyCents
  );
}

function sumLineItemsGrossSalesCents(
  lineItems: ActivityOrder["lineItems"],
): number {
  return lineItems.reduce(
    (sum, lineItem) => sum + (lineItemGrossSalesCents(lineItem) ?? 0),
    0,
  );
}

function buildDiscountDetails(
  order: ActivityOrder,
  payment: PaymentDetails,
  locationName: string,
  deviceName: string,
) {
  const paymentTotalCents =
    payment?.amountMoneyCents ?? order.orderTotals.totalMoneyCents;
  return {
    originalTransactionAt: payment?.createdAt ?? order.createdAt ?? null,
    canceledAt: null,
    refundedAt: null,
    location: locationName,
    device: deviceName,
    paymentTitle: `${toDisplayAmount(paymentTotalCents)} payment`,
    receiptText: payment?.receiptNumber
      ? `Receipt #${payment.receiptNumber}`
      : "Receipt unavailable",
    receiptUrl: payment?.receiptUrl ?? null,
    items: order.lineItems.map((lineItem) => ({
      name: lineItem.name,
      detailLine: formatLineItemUnitTimesQty(
        lineItem.unitPriceMoneyCents,
        lineItem.quantity,
      ),
      subtitle: lineItem.variationName ?? null,
      amount: toDisplayAmount(
        lineItem.grossSalesMoneyCents ??
          computeLineBaseTotalCents(
            lineItem.unitPriceMoneyCents,
            lineItem.quantity,
          ) ??
          lineItem.totalMoneyCents,
      ),
      addons: lineItem.modifiers.map((modifier) => ({
        name: modifier.name,
        detailLine: formatLineItemUnitTimesQty(
          modifier.unitPriceMoneyCents,
          modifier.quantity,
        ),
        amount: toDisplayAmount(
          modifier.totalPriceMoneyCents ?? modifier.unitPriceMoneyCents,
        ),
      })),
    })),
    subtotal: toDisplayAmount(sumLineItemsGrossSalesCents(order.lineItems)),
    discountMoney: toDisplayDiscountMoney(order.orderTotals.discountMoneyCents),
    salesTax: toDisplayAmount(order.orderTotals.taxMoneyCents),
    tip: toDisplayAmount(payment?.tipMoneyCents ?? order.orderTotals.tipMoneyCents),
    serviceCharge: toDisplayAmount(order.orderTotals.serviceChargeMoneyCents),
    total: toDisplayAmount(paymentTotalCents),
  };
}

function buildRefundDetails(
  payment: PaymentDetails,
  originalPayment: PaymentDetails,
  refund: ActivityOrder["refunds"][number],
  locationName: string,
  deviceName: string,
  canceledAt: string | null,
  refundedAt: string | null,
) {
  const refundTotalCents = refund.refundAmountMoneyCents ?? payment?.amountMoneyCents;
  return {
    originalTransactionAt: originalPayment?.createdAt ?? null,
    canceledAt,
    refundedAt,
    location: locationName,
    device: deviceName,
    paymentTitle: `${toDisplayAmount(refundTotalCents)} refund`,
    receiptText: payment?.receiptNumber
      ? `Receipt #${payment.receiptNumber}`
      : "Receipt unavailable",
    receiptUrl: payment?.receiptUrl ?? null,
    items: refund.lineItems.map((lineItem) => ({
      name: lineItem.name,
      detailLine: formatLineItemUnitTimesQty(
        lineItem.unitPriceMoneyCents,
        lineItem.quantity,
      ),
      subtitle: lineItem.variationName ?? null,
      amount: toDisplayAmount(
        lineItem.grossReturnMoneyCents ??
          computeLineBaseTotalCents(
            lineItem.unitPriceMoneyCents,
            lineItem.quantity,
          ),
      ),
      addons: lineItem.modifiers.map((modifier) => ({
        name: modifier.name,
        detailLine: formatLineItemUnitTimesQty(
          modifier.unitPriceMoneyCents,
          modifier.quantity,
        ),
        amount: toDisplayAmount(
          modifier.totalPriceMoneyCents ?? modifier.unitPriceMoneyCents,
        ),
      })),
    })),
    subtotal: toDisplayAmount(
      calculateSubtotal(
        refund.refundAmountMoneyCents,
        refund.taxMoneyCents,
        refund.tipMoneyCents,
        refund.serviceChargeMoneyCents,
      ),
    ),
    salesTax: toDisplayAmount(refund.taxMoneyCents),
    tip: toDisplayAmount(refund.tipMoneyCents),
    serviceCharge: toDisplayAmount(refund.serviceChargeMoneyCents),
    total: toDisplayAmount(refund.refundAmountMoneyCents),
  };
}

export class ActivityLogService {
  private readonly locationService: LocationService;

  constructor() {
    this.locationService = new LocationService();
  }

  /**
   * Resolve a Square payment id through the per-request promise cache. The
   * first caller registers the in-flight Promise so concurrent callers waiting
   * on the same id share the lookup instead of starting their own.
   */
  private getCachedPayment(
    paymentId: string | null,
    paymentCache: ActivityLogPaymentCache,
  ): Promise<PaymentDetails> {
    if (!paymentId) return Promise.resolve(null);
    const existing = paymentCache.get(paymentId);
    if (existing) return existing;
    const inflight = getSquarePaymentDetailsFromCache(paymentId).catch(() => null);
    paymentCache.set(paymentId, inflight);
    return inflight;
  }

  /**
   * Resolve a Square team member id through the per-request promise cache.
   * Tries Mongo first, then falls back to a live Square RetrieveTeamMember
   * call for ids missing from the cache (typically inactive POS users that
   * the active-only sync doesn't pull). On a successful API fallback the
   * resolved payload is back-filled into the `SquareTeamMember` collection so
   * subsequent activity-log requests can read it from Mongo without paying
   * the network round-trip again.
   */
  private getCachedTeamMember(
    teamMemberId: string | null,
    teamMemberCache: ActivityLogTeamMemberCache,
    squareAccessToken: string | null,
    locationId: string,
  ): Promise<TeamMemberDetails> {
    if (!teamMemberId) return Promise.resolve(null);
    const existing = teamMemberCache.get(teamMemberId);
    if (existing) return existing;
    const inflight = this.resolveTeamMember(
      teamMemberId,
      squareAccessToken,
      locationId,
    );
    teamMemberCache.set(teamMemberId, inflight);
    return inflight;
  }

  /**
   * Bulk-resolve every payment and team member referenced by the given orders
   * in (at most) two `$in` Mongo queries plus one parallel batch of Square
   * API fallbacks, then seed the per-request promise caches with resolved
   * values. The row builder loop afterward finds every id pre-resolved and
   * never triggers a per-order findOne.
   *
   * Ids already present in the caches (e.g. seeded by a sibling fan-out
   * branch) are skipped — we only do the work that's left.
   */
  private async prewarmCachesForOrders(args: {
    orders: Awaited<ReturnType<typeof searchOrdersWithDiscountsFromCache>>;
    paymentCache: ActivityLogPaymentCache;
    teamMemberCache: ActivityLogTeamMemberCache;
    squareAccessToken: string | null;
    locationId: string;
  }): Promise<void> {
    const { orders, paymentCache, teamMemberCache, squareAccessToken, locationId } = args;

    // Phase 1: collect every payment id referenced by these orders (first
    // payment + first refund's tender) that the cache hasn't already resolved.
    const paymentIdsToLoad = new Set<string>();
    for (const order of orders) {
      const firstPaymentId = order.paymentIds[0];
      if (firstPaymentId && !paymentCache.has(firstPaymentId)) {
        paymentIdsToLoad.add(firstPaymentId);
      }
      const refundPaymentId = order.refunds[0]?.tenderId;
      if (refundPaymentId && !paymentCache.has(refundPaymentId)) {
        paymentIdsToLoad.add(refundPaymentId);
      }
    }

    let bulkPayments: Awaited<ReturnType<typeof getSquarePaymentDetailsBatchFromCache>> | null = null;
    if (paymentIdsToLoad.size > 0) {
      try {
        bulkPayments = await getSquarePaymentDetailsBatchFromCache([...paymentIdsToLoad]);
      } catch (err) {
        logger.warn("[activity-log] bulk payment prefetch failed", {
          locationId,
          requestedCount: paymentIdsToLoad.size,
          error: err instanceof Error ? err.message : String(err),
        });
        bulkPayments = new Map();
      }
      for (const id of paymentIdsToLoad) {
        const value = bulkPayments.get(id) ?? null;
        paymentCache.set(id, Promise.resolve(value));
      }
    }

    // Phase 2: collect every team member id, including the
    // `payment.employeeId` / `payment.teamMemberId` fallbacks for orders
    // whose own `createdByTeamMemberId` is missing.
    const teamMemberIdsToLoad = new Set<string>();
    for (const order of orders) {
      let teamMemberId: string | null = order.createdByTeamMemberId ?? null;
      if (!teamMemberId) {
        const firstPaymentId = order.paymentIds[0] ?? null;
        if (firstPaymentId) {
          const payment = bulkPayments?.get(firstPaymentId) ?? null;
          teamMemberId = payment?.employeeId ?? payment?.teamMemberId ?? null;
        }
      }
      if (teamMemberId && !teamMemberCache.has(teamMemberId)) {
        teamMemberIdsToLoad.add(teamMemberId);
      }
    }

    if (teamMemberIdsToLoad.size === 0) return;

    let bulkTeamMembers: Awaited<ReturnType<typeof getSquareTeamMembersBatchFromCache>>;
    try {
      bulkTeamMembers = await getSquareTeamMembersBatchFromCache([...teamMemberIdsToLoad]);
    } catch (err) {
      logger.warn("[activity-log] bulk team member prefetch failed", {
        locationId,
        requestedCount: teamMemberIdsToLoad.size,
        error: err instanceof Error ? err.message : String(err),
      });
      bulkTeamMembers = new Map();
    }

    // Seed hits straight from the bulk result.
    const cacheMisses: string[] = [];
    for (const id of teamMemberIdsToLoad) {
      const hit = bulkTeamMembers.get(id);
      if (hit) {
        const resolved: TeamMemberDetails = {
          id: hit.id,
          givenName: hit.givenName,
          familyName: hit.familyName,
          ...(hit.jobTitle ? { jobTitle: hit.jobTitle } : {}),
        };
        teamMemberCache.set(id, Promise.resolve(resolved));
      } else {
        cacheMisses.push(id);
      }
    }

    // Phase 3: fall back to live Square API in parallel for misses (typically
    // inactive POS users that the active-only sync didn't pull). Each
    // resolved member is back-filled into the Mongo cache so subsequent
    // requests skip the network hop. `resolveTeamMemberMiss` runs in parallel
    // via Promise.all so 5 cache misses cost ~1 Square API latency, not 5×.
    if (cacheMisses.length === 0) return;
    if (!squareAccessToken) {
      for (const id of cacheMisses) {
        teamMemberCache.set(id, Promise.resolve(null));
      }
      return;
    }

    // Register the in-flight promise immediately so concurrent fan-out
    // branches share the lookup instead of starting their own.
    const inflight = cacheMisses.map((id) => {
      const promise = this.resolveTeamMemberMissViaSquareApi(
        id,
        squareAccessToken,
        locationId,
      );
      teamMemberCache.set(id, promise);
      return promise;
    });
    await Promise.all(inflight);
  }

  private async resolveTeamMemberMissViaSquareApi(
    teamMemberId: string,
    squareAccessToken: string,
    locationId: string,
  ): Promise<TeamMemberDetails> {
    try {
      const fromApi = await getTeamMemberById(teamMemberId, {
        accessToken: squareAccessToken,
      });
      if (!fromApi) return null;
      if (fromApi.raw) {
        try {
          await upsertSquareTeamMember(locationId, fromApi.raw);
        } catch (writeErr) {
          logger.warn("[activity-log] team member backfill upsert failed", {
            teamMemberId,
            locationId,
            error: writeErr instanceof Error ? writeErr.message : String(writeErr),
          });
        }
      }
      return {
        id: fromApi.id,
        givenName: fromApi.givenName,
        familyName: fromApi.familyName,
        ...(fromApi.jobTitle ? { jobTitle: fromApi.jobTitle } : {}),
      };
    } catch (err) {
      logger.warn("[activity-log] Square RetrieveTeamMember failed", {
        teamMemberId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async resolveTeamMember(
    teamMemberId: string,
    squareAccessToken: string | null,
    locationId: string,
  ): Promise<TeamMemberDetails> {
    try {
      const fromDb = await getSquareTeamMemberRawFromCache(teamMemberId);
      if (fromDb) {
        return {
          id: fromDb.id,
          givenName: fromDb.givenName,
          familyName: fromDb.familyName,
          ...(fromDb.jobTitle ? { jobTitle: fromDb.jobTitle } : {}),
        };
      }
    } catch (err) {
      logger.warn("[activity-log] team member cache read failed", {
        teamMemberId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Cache miss — POS-created orders can reference inactive members not in the
    // Mongo team-member sync (which only pulls ACTIVE). Fall back to Square's
    // RetrieveTeamMember API so "applied by" still resolves.
    if (!squareAccessToken) return null;
    try {
      const fromApi = await getTeamMemberById(teamMemberId, {
        accessToken: squareAccessToken,
      });
      if (!fromApi) return null;

      // Back-fill the Mongo cache so the next activity-log request reads this
      // member from `SquareTeamMember` and skips the live Square API call.
      // The active-only sync would not otherwise repopulate it because this id
      // is an inactive (or otherwise un-listed) team member. Failure is
      // non-fatal: we still return the in-memory result for this response.
      if (fromApi.raw) {
        try {
          await upsertSquareTeamMember(locationId, fromApi.raw);
        } catch (writeErr) {
          logger.warn("[activity-log] team member backfill upsert failed", {
            teamMemberId,
            locationId,
            error: writeErr instanceof Error ? writeErr.message : String(writeErr),
          });
        }
      }

      return {
        id: fromApi.id,
        givenName: fromApi.givenName,
        familyName: fromApi.familyName,
        ...(fromApi.jobTitle ? { jobTitle: fromApi.jobTitle } : {}),
      };
    } catch (err) {
      logger.warn("[activity-log] Square RetrieveTeamMember failed", {
        teamMemberId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async getByLocationAndDate(
    locationId: string,
    date: string,
    caches?: {
      paymentCache?: ActivityLogPaymentCache;
      teamMemberCache?: ActivityLogTeamMemberCache;
    },
  ): Promise<ActivityLogListResult> {
    const locationWithCredentials =
      await this.locationService.getByIdWithCredentials(locationId);
    if (!locationWithCredentials?.location) {
      throw new ValidationError("Location not found.");
    }
    const location = locationWithCredentials.location;
    if (!location.squareLocationId) {
      throw new ValidationError("Square location is not configured.");
    }

    const { year, month0, day } = parseYmdDate(date);
    const range = getBusinessDayRangeForDate(
      location.timezone || "UTC",
      location.businessStartTime?.trim() ?? "00:00",
      year,
      month0,
      day,
    );
    const orders = await searchOrdersWithDiscountsFromCache(locationId, range);

    // Use caller-provided caches when available so the all-locations fan-out
    // shares one `Map` per HTTP request across all per-location calls.
    const paymentCache: ActivityLogPaymentCache =
      caches?.paymentCache ?? new Map();
    const teamMemberCache: ActivityLogTeamMemberCache =
      caches?.teamMemberCache ?? new Map();
    const squareAccessToken = locationWithCredentials.squareAccessToken ?? null;

    // Pre-warm caches with bulk `$in` lookups so the row-builder loop hits
    // resolved promises instead of doing one Mongo findOne per order. Without
    // this, a busy day's 100+ orders trigger 300+ sequential round-trips and
    // dominate the response time. We do payments first, then derive team-
    // member ids from order + payment so the second batch covers fallbacks.
    await this.prewarmCachesForOrders({
      orders,
      paymentCache,
      teamMemberCache,
      squareAccessToken,
      locationId,
    });

    const rows: ActivityLogRowDto[] = await buildActivityLogRowsForOrders({
      orders,
      location,
      getCachedPayment: (paymentId) => this.getCachedPayment(paymentId, paymentCache),
      getCachedTeamMember: (teamMemberId) =>
        this.getCachedTeamMember(teamMemberId, teamMemberCache, squareAccessToken, locationId),
      formatAppliedBy,
      discountRowNameBase,
      listNamePartsWithAmount: (baseWithoutAmount, amountMoneyCents) => {
        const parts = listNamePartsWithAmount(baseWithoutAmount, amountMoneyCents);
        return { ...parts, amount: parts.nameAmountBadgeText ?? "—" };
      },
      buildDiscountDetails,
      buildRefundDetails,
    });
    sortActivityLogRowsNewestFirst(rows);

    const total = rows.length;
    return {
      items: rows,
      meta: {
        total,
        page: 1,
        limit: total,
        totalPages: 1,
      },
    };
  }
}
