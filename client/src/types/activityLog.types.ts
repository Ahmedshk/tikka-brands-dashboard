export interface ActivityLogDetailAddon {
  name: string;
  detailLine?: string | null;
  amount: string;
}

export interface ActivityLogDetailItem {
  name: string;
  detailLine?: string | null;
  subtitle: string | null;
  amount: string;
  addons?: ActivityLogDetailAddon[];
}

export interface ActivityLogDetails {
  originalTransactionAt: string | null;
  canceledAt: string | null;
  refundedAt: string | null;
  location: string;
  device: string;
  paymentTitle: string;
  receiptText: string;
  receiptUrl: string | null;
  items: ActivityLogDetailItem[];
  subtotal: string;
  /** Order-level discount (discount modal only). */
  discountMoney?: string;
  salesTax: string;
  tip: string;
  serviceCharge: string;
  total: string;
}

export interface ActivityLogRow {
  eventType: "Discounts" | "Refunds";
  name: string;
  namePrefix?: string;
  nameAmountBadgeText?: string;
  appliedBy: string;
  /** From Square team member wage_setting when present. */
  appliedByJobTitle?: string;
  appliedAt: string | null;
  details: ActivityLogDetails;
}

export interface ActivityLogPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
