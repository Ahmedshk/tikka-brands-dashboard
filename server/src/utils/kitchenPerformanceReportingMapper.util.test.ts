import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapKitchenPerformanceStationType } from "./kitchenPerformanceStationType.util.js";
import { mapKdsStationSummaryRows } from "./kitchenPerformanceReportingMapper.util.js";

describe("mapKitchenPerformanceStationType", () => {
  it("maps Square station_type codes to display labels", () => {
    assert.equal(mapKitchenPerformanceStationType("kds"), "Prep");
    assert.equal(mapKitchenPerformanceStationType("kds_expo"), "Expeditor");
  });

  it("passes through existing display labels", () => {
    assert.equal(mapKitchenPerformanceStationType("Prep"), "Prep");
    assert.equal(mapKitchenPerformanceStationType("Expeditor"), "Expeditor");
  });

  it("returns Unknown for missing values", () => {
    assert.equal(mapKitchenPerformanceStationType(null), "Unknown");
    assert.equal(mapKitchenPerformanceStationType("other"), "Unknown");
  });
});

describe("mapKdsStationSummaryRows", () => {
  it("maps station summary rows with type labels", () => {
    const rows = mapKdsStationSummaryRows(
      [
        {
          "KDS.device_code_name": "Kukri Expeditor",
          "KDS.station_type": "kds_expo",
          "KDS.location_name": "Kukri",
          "KDS.ticket_count": 64,
          "KDS.avg_ticket_time_seconds": 120,
        },
        {
          "KDS.device_code_name": "Kukri Prep",
          "KDS.station_type": "kds",
          "KDS.location_name": "Kukri",
          "KDS.ticket_count": 4,
          "KDS.avg_ticket_time_seconds": 90,
        },
      ],
      "mongo-1",
      "Fallback Location",
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.type, "Expeditor");
    assert.equal(rows[0]?.completedTickets, 64);
    assert.equal(rows[1]?.type, "Prep");
  });
});
