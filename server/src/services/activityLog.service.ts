import { LocationService } from "./location.service.js";
import {
  getSquarePaymentDetailsFromCache,
  getSquareTeamMemberRawFromCache,
  searchOrdersWithDiscountsFromCache,
} from "./integrationCacheRead.service.js";
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

  private async getCachedPayment(
    paymentId: string | null,
    paymentCache: Map<string, PaymentDetails>,
  ): Promise<PaymentDetails> {
    if (!paymentId) return null;
    if (!paymentCache.has(paymentId)) {
      try {
        paymentCache.set(
          paymentId,
          await getSquarePaymentDetailsFromCache(paymentId),
        );
      } catch {
        paymentCache.set(paymentId, null);
      }
    }
    return paymentCache.get(paymentId) ?? null;
  }

  private async getCachedTeamMember(
    teamMemberId: string | null,
    teamMemberCache: Map<string, TeamMemberDetails>,
    squareAccessToken: string | null,
  ): Promise<TeamMemberDetails> {
    if (!teamMemberId) return null;
    if (teamMemberCache.has(teamMemberId)) {
      return teamMemberCache.get(teamMemberId) ?? null;
    }
    try {
      const fromDb = await getSquareTeamMemberRawFromCache(teamMemberId);
      if (fromDb) {
        const cached: TeamMemberDetails = {
          id: fromDb.id,
          givenName: fromDb.givenName,
          familyName: fromDb.familyName,
          ...(fromDb.jobTitle ? { jobTitle: fromDb.jobTitle } : {}),
        };
        teamMemberCache.set(teamMemberId, cached);
        return cached;
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
    if (squareAccessToken) {
      try {
        const fromApi = await getTeamMemberById(teamMemberId, {
          accessToken: squareAccessToken,
        });
        const resolved: TeamMemberDetails = fromApi
          ? {
              id: fromApi.id,
              givenName: fromApi.givenName,
              familyName: fromApi.familyName,
              ...(fromApi.jobTitle ? { jobTitle: fromApi.jobTitle } : {}),
            }
          : null;
        teamMemberCache.set(teamMemberId, resolved);
        return resolved;
      } catch (err) {
        logger.warn("[activity-log] Square RetrieveTeamMember failed", {
          teamMemberId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    teamMemberCache.set(teamMemberId, null);
    return null;
  }

  async getByLocationAndDate(
    locationId: string,
    date: string,
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

    const paymentCache = new Map<string, PaymentDetails>();
    const teamMemberCache = new Map<string, TeamMemberDetails>();
    const squareAccessToken = locationWithCredentials.squareAccessToken ?? null;

    const rows: ActivityLogRowDto[] = await buildActivityLogRowsForOrders({
      orders,
      location,
      getCachedPayment: (paymentId) => this.getCachedPayment(paymentId, paymentCache),
      getCachedTeamMember: (teamMemberId) =>
        this.getCachedTeamMember(teamMemberId, teamMemberCache, squareAccessToken),
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
