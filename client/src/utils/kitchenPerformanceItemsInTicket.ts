import type { KitchenPerformanceTicketLineItem } from "../types/kitchenPerformance.types";
import {
  formatKitchenPerformanceItemName,
  itemNamesMatchKitchenPerformanceFilter,
} from "./kitchenPerformanceItemName.util";

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

function ticketLineItemMatchesSelection(
  line: KitchenPerformanceTicketLineItem,
  selectedItemName: string,
): boolean {
  if (itemNamesMatchKitchenPerformanceFilter(line.itemName, selectedItemName)) {
    return true;
  }

  for (const option of line.options) {
    if (
      itemNamesMatchKitchenPerformanceFilter(
        formatKitchenPerformanceItemName(line.itemName, option),
        selectedItemName,
      )
    ) {
      return true;
    }
  }

  return false;
}

/** True if the ticket includes the selected item performance row name. */
export function ticketRowIncludesItemName(
  row: {
    itemsInTicket: string | null;
    ticketLineItems?: KitchenPerformanceTicketLineItem[] | null;
  },
  selectedItemName: string,
): boolean {
  if (!selectedItemName.trim()) return false;

  if (row.ticketLineItems?.length) {
    return row.ticketLineItems.some((line) =>
      ticketLineItemMatchesSelection(line, selectedItemName),
    );
  }

  return parseItemsInTicket(row.itemsInTicket).some((parsed) =>
    itemNamesMatchKitchenPerformanceFilter(parsed.itemName, selectedItemName),
  );
}
