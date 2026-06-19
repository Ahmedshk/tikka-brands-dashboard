import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { itemNamesMatchKitchenPerformanceFilter } from "./kitchenPerformanceItemName.util";
import { ticketRowIncludesItemName } from "./kitchenPerformanceItemsInTicket";

describe("itemNamesMatchKitchenPerformanceFilter", () => {
  it("matches item performance labels to ticket lines with variations", () => {
    assert.equal(
      itemNamesMatchKitchenPerformanceFilter(
        "California Burrito - Regular",
        "California Burrito",
      ),
      true,
    );
    assert.equal(
      itemNamesMatchKitchenPerformanceFilter(
        "Chicken Tenders - 3 Tenders",
        "Chicken Tenders - 3 Tenders",
      ),
      true,
    );
  });
});

describe("ticketRowIncludesItemName", () => {
  it("matches tickets using structured line items", () => {
    assert.equal(
      ticketRowIncludesItemName(
        {
          itemsInTicket: null,
          ticketLineItems: [
            { itemName: "California Burrito", quantity: 1, options: [] },
          ],
        },
        "California Burrito",
      ),
      true,
    );
  });

  it("matches tickets using serialized itemsInTicket", () => {
    assert.equal(
      ticketRowIncludesItemName(
        {
          itemsInTicket: "1 x California Burrito - Regular",
          ticketLineItems: null,
        },
        "California Burrito",
      ),
      true,
    );
  });
});
