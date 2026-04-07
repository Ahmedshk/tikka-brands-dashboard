/**
 * Derive MarketMan order status id / UI name from OrderStatus when webhook omits them.
 */

function isMissingOrderField(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (typeof v === "number" && Number.isNaN(v)) return true;
  return false;
}

type KnownOrderStatus =
  | "Sent"
  | "Confirmed by vendor"
  | "Cancelled by buyer"
  | "Submission Rejected"
  | "Vendor handling"
  | "Cancelled by vendor";

function statusMapping(
  status: KnownOrderStatus,
): { OrderStatusID: number; OrderStatusUIName: string } {
  switch (status) {
    case "Sent":
      return { OrderStatusID: 5, OrderStatusUIName: "Sent" };
    case "Confirmed by vendor":
      return { OrderStatusID: 2, OrderStatusUIName: "Confirmed by supplier" };
    case "Cancelled by buyer":
      return { OrderStatusID: 3, OrderStatusUIName: "Cancelled by buyer" };
    case "Submission Rejected":
      return { OrderStatusID: 14, OrderStatusUIName: "Submission Rejected" };
    case "Vendor handling":
      return { OrderStatusID: 6, OrderStatusUIName: "Received" };
    case "Cancelled by vendor":
      return { OrderStatusID: 4, OrderStatusUIName: "Cancelled by supplier" };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function resolveKnownOrderStatus(trimmed: string): KnownOrderStatus | null {
  const known: KnownOrderStatus[] = [
    "Sent",
    "Confirmed by vendor",
    "Cancelled by buyer",
    "Submission Rejected",
    "Vendor handling",
    "Cancelled by vendor",
  ];
  return known.includes(trimmed as KnownOrderStatus)
    ? (trimmed as KnownOrderStatus)
    : null;
}

/**
 * Fills missing `OrderStatusID` and/or `OrderStatusUIName` from trimmed `OrderStatus` when it matches a known value.
 * Does not overwrite existing non-missing fields.
 */
export function fillMissingOrderStatusFieldsFromOrderStatus(
  order: Record<string, unknown>,
): void {
  const raw = order.OrderStatus;
  if (typeof raw !== "string") return;
  const trimmed = raw.trim();
  if (!trimmed) return;

  const known = resolveKnownOrderStatus(trimmed);
  if (!known) return;

  const { OrderStatusID, OrderStatusUIName } = statusMapping(known);

  if (isMissingOrderField(order.OrderStatusID)) {
    order.OrderStatusID = OrderStatusID;
  }
  if (isMissingOrderField(order.OrderStatusUIName)) {
    order.OrderStatusUIName = OrderStatusUIName;
  }
}
