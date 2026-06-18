import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatKitchenPerformanceItemName } from "./kitchenPerformanceItemName.util.js";

describe("formatKitchenPerformanceItemName", () => {
  it("joins item name and variation like Square", () => {
    assert.equal(
      formatKitchenPerformanceItemName("Chicken Tenders", "3 Tenders"),
      "Chicken Tenders - 3 Tenders",
    );
  });

  it("returns item name when variation is absent", () => {
    assert.equal(formatKitchenPerformanceItemName("California Burrito", null), "California Burrito");
  });
});
