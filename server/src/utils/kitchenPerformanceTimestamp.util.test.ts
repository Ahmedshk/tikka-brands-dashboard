import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeKdsReportingTimestampToUtcIso,
  normalizeKitchenPerformanceTimestampToUtcIso,
  parseKdsReportingTimestamp,
  parseKitchenPerformanceTimestamp,
  sortKitchenPerformanceTicketsByTimeCreatedAsc,
} from "./kitchenPerformanceTimestamp.util.js";

const DENVER = "America/Denver";

describe("parseKitchenPerformanceTimestamp", () => {
  it("treats naive CSV timestamps as store wall time", () => {
    const instant = parseKitchenPerformanceTimestamp("2026-06-15 14:30:00", DENVER);
    assert.ok(instant);
    assert.equal(instant.toISOString(), "2026-06-15T20:30:00.000Z");
  });

  it("parses absolute UTC timestamps unchanged", () => {
    const instant = parseKitchenPerformanceTimestamp("2026-06-15T20:30:00.000Z", DENVER);
    assert.ok(instant);
    assert.equal(instant.toISOString(), "2026-06-15T20:30:00.000Z");
  });

  it("normalizes naive CSV values to UTC ISO", () => {
    assert.equal(
      normalizeKitchenPerformanceTimestampToUtcIso("2026-06-15 14:30:00", DENVER),
      "2026-06-15T20:30:00.000Z",
    );
  });

  it("sorts tickets by sent-to-KDS time ascending", () => {
    const sorted = sortKitchenPerformanceTicketsByTimeCreatedAsc(
      [
        { timeCreated: "2026-06-15T16:00:00.000Z" },
        { timeCreated: "2026-06-15T14:30:00.000Z" },
        { timeCreated: "2026-06-15T15:15:00.000Z" },
      ],
      DENVER,
    );
    assert.deepEqual(
      sorted.map((row) => row.timeCreated),
      [
        "2026-06-15T14:30:00.000Z",
        "2026-06-15T15:15:00.000Z",
        "2026-06-15T16:00:00.000Z",
      ],
    );
  });
});

describe("parseKdsReportingTimestamp", () => {
  it("treats naive Square KDS timestamps as UTC", () => {
    const instant = parseKdsReportingTimestamp("2026-06-15 17:09:00");
    assert.ok(instant);
    assert.equal(instant.toISOString(), "2026-06-15T17:09:00.000Z");
  });

  it("normalizes naive KDS values for local display", () => {
    assert.equal(
      normalizeKdsReportingTimestampToUtcIso("2026-06-15 17:09:00"),
      "2026-06-15T17:09:00.000Z",
    );
  });
});
