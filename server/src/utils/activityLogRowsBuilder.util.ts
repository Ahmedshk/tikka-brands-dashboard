import {
  getSquarePaymentDetailsFromCache,
  searchOrdersWithDiscountsFromCache,
} from "../services/integrationCacheRead.service.js";
import type { ActivityLogDetailsDto, ActivityLogRowDto } from "../types/activityLog.types.js";

type PaymentDetails = Awaited<ReturnType<typeof getSquarePaymentDetailsFromCache>>;
type ActivityOrder = Awaited<ReturnType<typeof searchOrdersWithDiscountsFromCache>>[number];

function appliedByJobTitleField(jobTitle: string | undefined): { appliedByJobTitle: string } | {} {
  return jobTitle ? { appliedByJobTitle: jobTitle } : {};
}

function appliedAtForOrder(args: {
  order: ActivityOrder;
  payment: PaymentDetails;
}): string | null {
  const { order, payment } = args;
  return order.updatedAt ?? order.createdAt ?? payment?.updatedAt ?? payment?.createdAt ?? null;
}

export async function buildActivityLogRowsForOrders(args: {
  orders: ActivityOrder[];
  location: { storeName?: string | null };
  getCachedPayment: (paymentId: string | null) => Promise<PaymentDetails>;
  getCachedTeamMember: (teamMemberId: string | null) => Promise<{ jobTitle?: string; givenName: string | null; familyName: string | null } | null>;
  formatAppliedBy: (givenName: string | null, familyName: string | null) => string;
  discountRowNameBase: (discount: ActivityOrder["discounts"][number], order: ActivityOrder) => string;
  listNamePartsWithAmount: (
    baseWithoutAmount: string,
    amountMoneyCents: number | undefined,
  ) => { name: string; namePrefix?: string; nameAmountBadgeText?: string; amount?: string };
  buildDiscountDetails: (
    order: ActivityOrder,
    payment: PaymentDetails,
    locationName: string,
    deviceName: string,
  ) => ActivityLogDetailsDto;
  buildRefundDetails: (
    payment: PaymentDetails,
    refundPayment: PaymentDetails,
    refund: ActivityOrder["refunds"][number],
    locationName: string,
    deviceName: string,
    refundAppliedAt: string | null,
    orderAppliedAt: string | null,
  ) => ActivityLogDetailsDto;
}): Promise<ActivityLogRowDto[]> {
  const {
    orders,
    location,
    getCachedPayment,
    getCachedTeamMember,
    formatAppliedBy,
    discountRowNameBase,
    listNamePartsWithAmount,
    buildDiscountDetails,
    buildRefundDetails,
  } = args;

  const rows: ActivityLogRowDto[] = [];
  const locationName = location.storeName || "—";

  for (const order of orders) {
    const firstPaymentId = order.paymentIds[0] ?? null;
    const payment = await getCachedPayment(firstPaymentId);

    const refundPaymentId = order.refunds[0]?.tenderId ?? null;
    const refundPayment = await getCachedPayment(refundPaymentId);

    // Prefer the order's POS-recorded team member; payment fields are the fallback
    // (POS-created orders often lack employee_id on the payment).
    const teamMemberId =
      order.createdByTeamMemberId ??
      payment?.employeeId ??
      payment?.teamMemberId ??
      null;
    const teamMember = await getCachedTeamMember(teamMemberId);

    const appliedBy = formatAppliedBy(teamMember?.givenName ?? null, teamMember?.familyName ?? null);
    const appliedByJobTitle = teamMember?.jobTitle;
    const appliedAt = appliedAtForOrder({ order, payment });
    const deviceName = payment?.deviceName ?? "—";

    for (const discount of order.discounts) {
      const nameParts = listNamePartsWithAmount(
        discountRowNameBase(discount, order),
        discount.amountMoneyCents,
      );
      rows.push({
        eventType: "Discounts",
        ...nameParts,
        appliedBy,
        ...appliedByJobTitleField(appliedByJobTitle),
        appliedAt,
        details: buildDiscountDetails(order, payment, locationName, deviceName),
      });
    }

    for (const refund of order.refunds) {
      const names = refund.lineItems.map((lineItem) => lineItem.name);
      const baseName = names.length > 0 ? names.join(", ") : "Refund";
      const nameParts = listNamePartsWithAmount(baseName, refund.refundAmountMoneyCents);
      rows.push({
        eventType: "Refunds",
        ...nameParts,
        appliedBy,
        ...appliedByJobTitleField(appliedByJobTitle),
        appliedAt,
        details: buildRefundDetails(
          payment,
          refundPayment,
          refund,
          locationName,
          deviceName,
          refund.refundCreatedAt ?? order.updatedAt ?? order.createdAt ?? null,
          appliedAt,
        ),
      });
    }
  }

  return rows;
}

export function sortActivityLogRowsNewestFirst(rows: ActivityLogRowDto[]): void {
  rows.sort((a, b) => {
    const aTs = a.appliedAt ? new Date(a.appliedAt).getTime() : -1;
    const bTs = b.appliedAt ? new Date(b.appliedAt).getTime() : -1;
    return bTs - aTs;
  });
}

