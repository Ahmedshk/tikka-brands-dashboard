export interface ActivityLogDetailAddonDto {
  name: string;
  detailLine?: string | null;
  amount: string;
}

export interface ActivityLogDetailItemDto {
  name: string;
  detailLine?: string | null;
  subtitle: string | null;
  amount: string;
  addons?: ActivityLogDetailAddonDto[];
}

export interface ActivityLogDetailsDto {
  originalTransactionAt: string | null;
  canceledAt: string | null;
  refundedAt: string | null;
  location: string;
  device: string;
  paymentTitle: string;
  receiptText: string;
  receiptUrl: string | null;
  items: ActivityLogDetailItemDto[];
  subtotal: string;
  /** Order-level discount (discount modal only); negative currency when present. */
  discountMoney?: string;
  salesTax: string;
  tip: string;
  serviceCharge: string;
  total: string;
}

export interface ActivityLogRowDto {
  eventType: "Discounts" | "Refunds";
  name: string;
  /** Text before ` - ($amount)`; set with `nameAmountBadgeText` when amount is shown as a badge in the list. */
  namePrefix?: string;
  /** Currency string for amount-only badge (e.g. `$5.00`), without parentheses. */
  nameAmountBadgeText?: string;
  appliedBy: string;
  /** Square wage_setting.job_assignments[0].job_title when present. */
  appliedByJobTitle?: string;
  appliedAt: string | null;
  details: ActivityLogDetailsDto;
  /** Square order id for notes and cross-row identity. */
  squareOrderId: string;
  /** Truncated effective note for list display. */
  notesPreview?: string | null;
  /** True when an effective note exists (dashboard or Square seed). */
  hasNotes?: boolean;
  /** Present when listing activity for multiple locations (e.g. `locationId=__all__`). */
  locationId?: string;
  locationName?: string;
}

export interface ActivityLogListResult {
  items: ActivityLogRowDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
