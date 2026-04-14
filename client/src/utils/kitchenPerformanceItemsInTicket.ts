export interface ParsedTicketLineItem {
  itemName: string;
  quantity: number;
}

/** Mirrors server `parseItemsInTicket` for display and client-side filtering. */
export function parseItemsInTicket(itemsInTicket: string | null): ParsedTicketLineItem[] {
  if (!itemsInTicket) return [];
  return itemsInTicket
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const match = /^(\d+)\s*x\s*(.+)$/i.exec(chunk);
      if (!match) {
        return { itemName: chunk, quantity: 1 };
      }
      const [, quantityRaw, itemNameRaw] = match;
      const quantity = Number.parseInt(quantityRaw ?? "1", 10);
      return {
        itemName: itemNameRaw?.trim() ?? chunk,
        quantity: Number.isNaN(quantity) || quantity < 1 ? 1 : quantity,
      };
    })
    .filter((x) => x.itemName.length > 0);
}

function normalizeItemKey(name: string): string {
  return name.trim().toLowerCase();
}

/** True if any parsed line item matches `selectedItemName` (case-insensitive trim). */
export function ticketRowIncludesItemName(
  itemsInTicket: string | null,
  selectedItemName: string,
): boolean {
  const key = normalizeItemKey(selectedItemName);
  if (!key) return false;
  return parseItemsInTicket(itemsInTicket).some(
    (p) => normalizeItemKey(p.itemName) === key,
  );
}
