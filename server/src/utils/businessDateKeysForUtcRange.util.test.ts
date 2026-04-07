import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { businessDateKeysForUtcRange } from "./businessDateKeysForUtcRange.util.js";

describe("businessDateKeysForUtcRange", () => {
  it("returns one key when start and end fall on the same local calendar day (UTC)", () => {
    const keys = businessDateKeysForUtcRange(
      "2024-06-10T08:00:00.000Z",
      "2024-06-10T20:00:00.000Z",
      "UTC",
    );
    assert.deepEqual(keys, ["2024-06-10"]);
  });

  it("returns inclusive keys across UTC midnights", () => {
    const keys = businessDateKeysForUtcRange(
      "2024-01-01T00:00:00.000Z",
      "2024-01-03T12:00:00.000Z",
      "UTC",
    );
    assert.deepEqual(keys, ["2024-01-01", "2024-01-02", "2024-01-03"]);
  });

  it("splits on the location timezone, not UTC (Tokyo ahead of UTC)", () => {
    // 2024-01-01 15:00 UTC = 2024-01-02 00:00 in Asia/Tokyo
    // 2024-01-02 14:59 UTC = 2024-01-02 23:59 in Asia/Tokyo → still one local day
    const keys = businessDateKeysForUtcRange(
      "2024-01-01T15:00:00.000Z",
      "2024-01-02T14:59:59.999Z",
      "Asia/Tokyo",
    );
    assert.deepEqual(keys, ["2024-01-02"]);
  });

  it("spans multiple local days when range crosses midnights in America/New_York", () => {
    // 2024-06-15 02:00 UTC → 2024-06-14 22:00 EDT
    // 2024-06-16 06:00 UTC → 2024-06-16 02:00 EDT
    const keys = businessDateKeysForUtcRange(
      "2024-06-15T02:00:00.000Z",
      "2024-06-16T06:00:00.000Z",
      "America/New_York",
    );
    assert.deepEqual(keys, ["2024-06-14", "2024-06-15", "2024-06-16"]);
  });

  it("accepts Date objects", () => {
    const keys = businessDateKeysForUtcRange(
      new Date("2024-03-01T00:00:00.000Z"),
      new Date("2024-03-01T23:59:59.999Z"),
      "UTC",
    );
    assert.deepEqual(keys, ["2024-03-01"]);
  });
});
