import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  averageKdsItemCompletionSeconds,
  averageKdsTicketCompletionSeconds,
  computeKdsCompletionSeconds,
} from "./kitchenPerformanceItemDuration.util.js";

describe("computeKdsCompletionSeconds", () => {
  it("floors sub-second durations like Square's KDS UI", () => {
    assert.equal(
      computeKdsCompletionSeconds(
        "2026-06-15T23:12:24.951",
        "2026-06-15T23:24:50.693",
      ),
      745,
    );
  });

  it("keeps whole-second durations unchanged", () => {
    assert.equal(
      computeKdsCompletionSeconds(
        "2026-06-16T01:23:22.551",
        "2026-06-16T01:49:37.992",
      ),
      1575,
    );
  });
});

describe("averageKdsTicketCompletionSeconds", () => {
  it("floors mean of floored ticket durations", () => {
    assert.equal(averageKdsTicketCompletionSeconds([745, 1575]), 1160);
    assert.equal(averageKdsTicketCompletionSeconds([745, 1575, 716, 6]), 760);
  });
});

describe("averageKdsItemCompletionSeconds", () => {
  it("floors item means with moderate fractional seconds", () => {
    assert.equal(averageKdsItemCompletionSeconds([729, 730, 730, 729]), 729);
    assert.equal(averageKdsItemCompletionSeconds([876, 876, 876]), 876);
  });

  it("rounds item means with high fractional seconds", () => {
    assert.equal(
      averageKdsItemCompletionSeconds([410, 525, 732, 895, 972, 1046, 1159, 1352, 1377]),
      941,
    );
  });
});
