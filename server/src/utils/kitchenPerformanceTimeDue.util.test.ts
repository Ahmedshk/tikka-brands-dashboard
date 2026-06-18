import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeKitchenPerformanceTicketLateFlag,
  normalizeKitchenPerformanceTimeDue,
} from "./kitchenPerformanceTimeDue.util.js";

describe("normalizeKitchenPerformanceTimeDue", () => {
  it("returns null when time due equals sent-to-KDS time", () => {
    const sent = "2026-06-15T17:09:00.000Z";
    assert.equal(normalizeKitchenPerformanceTimeDue(sent, sent), null);
  });

  it("returns null when due is in the same display minute as sent-to-KDS", () => {
    const sent = "2026-06-15T17:09:10.000Z";
    const due = "2026-06-15T17:09:45.000Z";
    assert.equal(normalizeKitchenPerformanceTimeDue(due, sent), null);
  });

  it("returns null when raw API values match before normalization", () => {
    assert.equal(
      normalizeKitchenPerformanceTimeDue(
        "2026-06-15T17:09:00.000Z",
        "2026-06-15T17:09:00.000Z",
        "2026-06-15 17:09:00",
        "2026-06-15 17:09:00",
      ),
      null,
    );
  });

  it("keeps distinct time due values", () => {
    const sent = "2026-06-15T17:09:00.000Z";
    const due = "2026-06-15T17:30:00.000Z";
    assert.equal(normalizeKitchenPerformanceTimeDue(due, sent), due);
  });
});

describe("normalizeKitchenPerformanceTicketLateFlag", () => {
  it("clears late when there is no meaningful time due", () => {
    assert.equal(normalizeKitchenPerformanceTicketLateFlag(true, null), false);
    assert.equal(normalizeKitchenPerformanceTicketLateFlag(true, "2026-06-15T17:30:00.000Z"), true);
  });
});
