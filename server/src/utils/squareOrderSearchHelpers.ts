/**
 * Helpers for Square order search results. Extracted to keep cognitive complexity low.
 */

export interface OrderInRange {
  created_at: string;
  amountCents: number;
}

/**
 * Map a page of orders to OrderInRange[], filtering by isCounted and requiring created_at.
 */
export function ordersFromSearchPage(
  orders: unknown[],
  isCounted: (order: unknown) => boolean,
  getCents: (order: unknown) => number,
): OrderInRange[] {
  const result: OrderInRange[] = [];
  for (const order of orders) {
    if (!isCounted(order)) continue;
    const created_at = (order as { created_at?: string }).created_at ?? "";
    if (created_at === "") continue;
    result.push({ created_at, amountCents: getCents(order) });
  }
  return result;
}
