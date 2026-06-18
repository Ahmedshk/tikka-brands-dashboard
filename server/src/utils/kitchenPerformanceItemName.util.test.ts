import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatKitchenPerformanceItemName, formatKitchenPerformanceItemPerformanceName } from "./kitchenPerformanceItemName.util.js";

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

describe("formatKitchenPerformanceItemPerformanceName", () => {
  it("hides default variations in the item performance tab", () => {
    assert.equal(
      formatKitchenPerformanceItemPerformanceName("California Burrito", "Regular"),
      "California Burrito",
    );
    assert.equal(
      formatKitchenPerformanceItemPerformanceName("Chicken Tenders", "3 Tenders"),
      "Chicken Tenders - 3 Tenders",
    );
  });
});
