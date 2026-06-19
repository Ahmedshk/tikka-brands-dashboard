import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapKitchenPerformanceStationType } from "./kitchenPerformanceStationType.util.js";
import {
  mapKdsStationSummaryRows,
  countUniqueKdsTicketsByDevice,
  applyDedupedTicketCountsToStationSummaryRows,
  buildKitchenPerformanceDetailsByDevice,
  mapKdsItemPerformanceRows,
} from "./kitchenPerformanceReportingMapper.util.js";

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
    assert.equal(rows[0]?.avgCompletionTimeSeconds, 120);
    assert.equal(rows[1]?.type, "Prep");
    assert.equal(rows[1]?.avgCompletionTimeSeconds, 90);
  });
});

describe("applyDedupedTicketCountsToStationSummaryRows", () => {
  it("replaces inflated station summary ticket_count with deduped ticket_key counts", () => {
    const listRows = mapKdsStationSummaryRows(
      [
        {
          "KDS.device_code_name": "Kukri 2- Expo",
          "KDS.station_type": "kds_expo",
          "KDS.location_name": "Kukri 2",
          "KDS.ticket_count": 140,
        },
      ],
      "mongo-1",
      "Kukri 2",
    );

    const ticketRows = [
      { "KDS.device_code_name": "Kukri 2- Expo", "KDS.ticket_key": "t1" },
      { "KDS.device_code_name": "Kukri 2- Expo", "KDS.ticket_key": "t1" },
      { "KDS.device_code_name": "Kukri 2- Expo", "KDS.ticket_key": "t2" },
    ];

    assert.equal(
      countUniqueKdsTicketsByDevice(ticketRows).get("Kukri 2- Expo"),
      2,
    );

    applyDedupedTicketCountsToStationSummaryRows(
      listRows,
      ticketRows,
      "mongo-1",
    );
    assert.equal(listRows[0]?.completedTickets, 2);
  });
});

describe("buildKitchenPerformanceDetailsByDevice recalled tickets", () => {
  it("counts recalled tickets from ticket rows, not inflated API recall_count", () => {
    const deviceName = "Kukri 3 - Prep Station";
    const listRows = mapKdsStationSummaryRows(
      [
        {
          "KDS.device_code_name": deviceName,
          "KDS.station_type": "kds",
          "KDS.ticket_count": 3,
        },
      ],
      "mongo-1",
      "KūKri 3",
    );

    const ticketRows = [
      {
        "KDS.device_code_name": deviceName,
        "KDS.ticket_key": "ticket-a",
        "KDS.ticket_name": "A",
        "KDS.display_on_kds_at": "2026-06-15T18:26:00.000",
        "KDS.actual_completed_at": "2026-06-15T18:45:00.000",
      },
      {
        "KDS.device_code_name": deviceName,
        "KDS.ticket_key": "ticket-b",
        "KDS.ticket_name": "B",
        "KDS.display_on_kds_at": "2026-06-15T18:29:00.000",
        "KDS.actual_completed_at": "2026-06-15T18:30:00.000",
      },
      {
        "KDS.device_code_name": deviceName,
        "KDS.ticket_key": "ticket-c",
        "KDS.ticket_name": "C",
        "KDS.display_on_kds_at": "2026-06-15T19:23:00.000",
        "KDS.actual_completed_at": "2026-06-15T19:34:00.000",
      },
    ];

    const lineItemRows = [
      {
        "KDS.device_code_name": deviceName,
        "KDS.ticket_key": "ticket-a",
        "KDS.item_name": "Item 1",
        "KDS.quantity": 1,
        "KDS.recalled_at": "2026-06-15T18:44:00.000",
      },
      {
        "KDS.device_code_name": deviceName,
        "KDS.ticket_key": "ticket-c",
        "KDS.item_name": "Item 2",
        "KDS.quantity": 2,
        "KDS.recalled_at": "2026-06-15T19:30:00.000",
      },
    ];

    const detailsByKey = buildKitchenPerformanceDetailsByDevice(
      listRows,
      ticketRows,
      [],
      lineItemRows,
      [],
      [
        {
          "KDS.device_code_name": deviceName,
          "KDS.ticket_count": 3,
          "KDS.recall_count": 3,
        },
      ],
      [],
      "mongo-1",
      "America/Denver",
    );

    const details = detailsByKey["mongo-1::Kukri 3 - Prep Station"];
    assert.equal(details?.kpis.recalledTickets, 2);
    assert.equal(
      details?.ticketRows.filter((row) => row.timeRecalled != null).length,
      2,
    );
  });
});

describe("mapKdsItemPerformanceRows", () => {
  it("uses deduped line-item quantities instead of inflated quantity_sold", () => {
    const rows = mapKdsItemPerformanceRows(
      [
        {
          "KDS.device_code_name": "Kukri 3 - Expeditor",
          "KDS.item_name": "California Burrito",
          "KDS.variation": "Regular",
          "KDS.quantity_sold": 52,
          "KDS.avg_item_time_seconds": 927.4,
          "KDS.min_item_time_seconds": 323.2,
          "KDS.max_item_time_seconds": 1557.8,
        },
        {
          "KDS.device_code_name": "Kukri 3 - Expeditor",
          "KDS.item_name": "Chicken Tenders",
          "KDS.variation": "3 Tenders",
          "KDS.quantity_sold": 13,
        },
      ],
      [
        {
          "KDS.device_code_name": "Kukri 3 - Expeditor",
          "KDS.ticket_key": "ticket-1",
          "KDS.item_name": "California Burrito",
          "KDS.variation": "Regular",
          "KDS.quantity": 13,
        },
        {
          "KDS.device_code_name": "Kukri 3 - Expeditor",
          "KDS.ticket_key": "ticket-1",
          "KDS.item_name": "California Burrito",
          "KDS.variation": "Regular",
          "KDS.quantity": 13,
        },
        {
          "KDS.device_code_name": "Kukri 3 - Expeditor",
          "KDS.ticket_key": "ticket-2",
          "KDS.item_name": "California Burrito",
          "KDS.variation": "Regular",
          "KDS.quantity": 12,
        },
        {
          "KDS.device_code_name": "Kukri 3 - Expeditor",
          "KDS.ticket_key": "ticket-3",
          "KDS.item_name": "Chicken Tenders",
          "KDS.variation": "3 Tenders",
          "KDS.quantity": 12,
        },
      ],
      "Kukri 3 - Expeditor",
    );

    assert.equal(rows[0]?.itemName, "California Burrito");
    assert.equal(rows[0]?.totalQuantity, 26);
    assert.equal(rows[1]?.itemName, "Chicken Tenders - 3 Tenders");
    assert.equal(rows[1]?.totalQuantity, 13);
  });
});
