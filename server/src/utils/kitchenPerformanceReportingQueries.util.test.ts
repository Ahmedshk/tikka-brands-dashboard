import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildKdsDateFilters,
  buildKdsItemPerformanceQuery,
} from "./kitchenPerformanceReportingQueries.util.js";

describe("buildKdsDateFilters", () => {
  it("uses equals for a single day", () => {
    assert.deepEqual(buildKdsDateFilters("2026-06-15", "2026-06-15"), [
      {
        member: "KDS.local_date",
        operator: "equals",
        values: ["2026-06-15"],
      },
    ]);
  });

  it("uses inDateRange for multi-day periods", () => {
    assert.deepEqual(buildKdsDateFilters("2026-06-10", "2026-06-16"), [
      {
        member: "KDS.local_date",
        operator: "inDateRange",
        values: ["2026-06-10", "2026-06-16"],
      },
    ]);
  });
});

describe("buildKdsItemPerformanceQuery", () => {
  it("does not restrict to prep items so expeditor stations return data", () => {
    const query = buildKdsItemPerformanceQuery(
      "LOC1",
      "2026-06-15",
      "2026-06-15",
    );
    assert.equal("segments" in query, false);
    assert.deepEqual(query.dimensions, [
      "KDS.device_code_name",
      "KDS.item_name",
      "KDS.variation",
    ]);
  });
});
