import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeKitchenPerformanceLateKpis } from "./kitchenPerformanceLateKpis.util.js";

describe("computeKitchenPerformanceLateKpis", () => {
  it("matches Square UI: late tickets divided by completed tickets", () => {
    const result = computeKitchenPerformanceLateKpis(
      [
        { isLate: true, timeDue: "2026-06-15T18:00:00.000Z" },
        { isLate: false, timeDue: null },
        { isLate: false, timeDue: null },
        { isLate: false, timeDue: null },
      ],
      64,
    );

    assert.equal(result.ticketsPastDueTime, 1);
    assert.equal(result.ticketsLatePercent, 1.56);
  });

  it("returns 6.25% for 4 late tickets out of 64 completed", () => {
    const rows = Array.from({ length: 64 }, (_, index) => ({
      isLate: index < 4,
      timeDue: index < 10 ? "2026-06-15T18:00:00.000Z" : null,
    }));

    const result = computeKitchenPerformanceLateKpis(rows, 64);
    assert.equal(result.ticketsPastDueTime, 4);
    assert.equal(result.ticketsLatePercent, 6.25);
  });
});
