import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRollupUncoveredSubRanges } from "./rollupSplitRange.util.js";
import { businessDayUtcRangeIsoStrings } from "./businessDayUtcRange.util.js";

const TZ = "America/Denver";
const BST = "06:00";

function dayRange(key: string): { startAt: string; endAt: string } {
  return businessDayUtcRangeIsoStrings(TZ, BST, key);
}

describe("computeRollupUncoveredSubRanges", () => {
  it("returns [] when every full day in the range is present", () => {
    const d1 = dayRange("2026-05-14");
    const d2 = dayRange("2026-05-15");
    const range = { startAt: d1.startAt, endAt: d2.endAt };
    const present = new Set(["2026-05-14", "2026-05-15"]);
    const sub = computeRollupUncoveredSubRanges(range, TZ, BST, present);
    assert.deepEqual(sub, []);
  });

  it("returns the original range when no full day intersects (e.g. partial 'today')", () => {
    const today = dayRange("2026-05-18");
    // Range = first 3 hours of today — partial, not fully covered.
    const partialEndMs = new Date(today.startAt).getTime() + 3 * 3_600_000;
    const range = {
      startAt: today.startAt,
      endAt: new Date(partialEndMs).toISOString(),
    };
    const sub = computeRollupUncoveredSubRanges(range, TZ, BST, new Set());
    assert.equal(sub.length, 1);
    assert.equal(sub[0]?.startAt, range.startAt);
    assert.equal(sub[0]?.endAt, range.endAt);
  });

  it("returns only the trailing partial-today fragment when all past full days are present", () => {
    const d1 = dayRange("2026-05-15"); // fully covered + present
    const today = dayRange("2026-05-17"); // partial
    const partialEndMs = new Date(today.startAt).getTime() + 8 * 3_600_000;
    const range = {
      startAt: d1.startAt,
      endAt: new Date(partialEndMs).toISOString(),
    };
    const present = new Set(["2026-05-15", "2026-05-16"]);
    const sub = computeRollupUncoveredSubRanges(range, TZ, BST, present);
    assert.equal(sub.length, 1);
    assert.equal(sub[0]?.startAt, today.startAt);
    assert.equal(sub[0]?.endAt, range.endAt);
  });

  it("returns missing-day sub-ranges plus trailing partial — and merges contiguous missing days", () => {
    const d11 = dayRange("2026-05-11"); // missing
    const d13 = dayRange("2026-05-13"); // missing (5-11 + 5-12 + 5-13 → merged)
    const today = dayRange("2026-05-18");
    const partialEndMs = new Date(today.startAt).getTime() + 4 * 3_600_000;
    const range = {
      startAt: d11.startAt,
      endAt: new Date(partialEndMs).toISOString(),
    };
    const present = new Set([
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
    ]);
    const sub = computeRollupUncoveredSubRanges(range, TZ, BST, present);
    assert.equal(sub.length, 2, "leading 3-day block + trailing partial today");
    assert.equal(sub[0]?.startAt, d11.startAt);
    assert.equal(sub[0]?.endAt, d13.endAt);
    assert.equal(sub[1]?.startAt, today.startAt);
    assert.equal(sub[1]?.endAt, range.endAt);
  });

  it("isolates a single gap day in the middle of present days", () => {
    const d14 = dayRange("2026-05-14"); // present
    const d15 = dayRange("2026-05-15"); // MISSING (single-day gap)
    const d16 = dayRange("2026-05-16"); // present
    const range = { startAt: d14.startAt, endAt: d16.endAt };
    const present = new Set(["2026-05-14", "2026-05-16"]);
    const sub = computeRollupUncoveredSubRanges(range, TZ, BST, present);
    assert.equal(sub.length, 1, "only the missing middle day");
    assert.equal(sub[0]?.startAt, d15.startAt);
    assert.equal(sub[0]?.endAt, d15.endAt);
  });
});
