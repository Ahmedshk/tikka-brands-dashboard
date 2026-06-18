import { describe, expect, it } from "vitest";
import { itemNamesMatchKitchenPerformanceFilter } from "./kitchenPerformanceItemName.util";
import { ticketRowIncludesItemName } from "./kitchenPerformanceItemsInTicket";

describe("itemNamesMatchKitchenPerformanceFilter", () => {
  it("matches item performance labels to ticket lines with variations", () => {
    expect(
      itemNamesMatchKitchenPerformanceFilter(
        "California Burrito - Regular",
        "California Burrito",
      ),
    ).toBe(true);
    expect(
      itemNamesMatchKitchenPerformanceFilter(
        "Chicken Tenders - 3 Tenders",
        "Chicken Tenders - 3 Tenders",
      ),
    ).toBe(true);
  });
});

describe("ticketRowIncludesItemName", () => {
  it("matches tickets using structured line items", () => {
    expect(
      ticketRowIncludesItemName(
        {
          itemsInTicket: null,
          ticketLineItems: [
            { itemName: "California Burrito", quantity: 1, options: [] },
          ],
        },
        "California Burrito",
      ),
    ).toBe(true);
  });

  it("matches tickets using serialized itemsInTicket", () => {
    expect(
      ticketRowIncludesItemName(
        {
          itemsInTicket: "1 x California Burrito - Regular",
          ticketLineItems: null,
        },
        "California Burrito",
      ),
    ).toBe(true);
  });
});
