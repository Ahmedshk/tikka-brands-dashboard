import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sumDedupedKdsItemQuantitiesByItemKey, resolveKitchenPerformanceItemTotalQuantity } from "./kitchenPerformanceItemQuantity.util.js";

describe("sumDedupedKdsItemQuantitiesByItemKey", () => {
  it("dedupes duplicate expeditor line items on the same ticket", () => {
    const totals = sumDedupedKdsItemQuantitiesByItemKey(
      [
        {
          "KDS.device_code_name": "Kukri 3 - Expeditor",
          "KDS.ticket_key": "ticket-1",
          "KDS.item_name": "California Burrito",
          "KDS.variation": "Regular",
          "KDS.quantity": 1,
        },
        {
          "KDS.device_code_name": "Kukri 3 - Expeditor",
          "KDS.ticket_key": "ticket-1",
          "KDS.item_name": "California Burrito",
          "KDS.variation": "Regular",
          "KDS.quantity": 1,
        },
        {
          "KDS.device_code_name": "Kukri 3 - Expeditor",
          "KDS.ticket_key": "ticket-2",
          "KDS.item_name": "California Burrito",
          "KDS.variation": "Regular",
          "KDS.quantity": 2,
        },
      ],
      "Kukri 3 - Expeditor",
    );

    assert.equal(totals.get("california burrito::regular"), 3);
  });
});

describe("resolveKitchenPerformanceItemTotalQuantity", () => {
  it("halves inflated quantity_sold when it is roughly 2x deduped line items", () => {
    assert.equal(resolveKitchenPerformanceItemTotalQuantity(52, 25), 26);
    assert.equal(resolveKitchenPerformanceItemTotalQuantity(52, 26), 26);
  });

  it("prefers quantity_sold when it is only slightly higher than deduped", () => {
    assert.equal(resolveKitchenPerformanceItemTotalQuantity(26, 25), 26);
    assert.equal(resolveKitchenPerformanceItemTotalQuantity(14, 13), 14);
  });
});
