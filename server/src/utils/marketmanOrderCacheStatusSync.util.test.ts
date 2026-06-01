import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  copyMarketManOrderStatusOntoRaw,
  siblingMarketManApiKind,
} from "./marketmanOrderCacheStatusSync.util.js";

describe("marketmanOrderCacheStatusSync", () => {
  it("siblingMarketManApiKind toggles sent and delivery", () => {
    assert.equal(siblingMarketManApiKind("sent"), "delivery");
    assert.equal(siblingMarketManApiKind("delivery"), "sent");
  });

  it("copyMarketManOrderStatusOntoRaw updates status fields only", () => {
    const target: Record<string, unknown> = {
      OrderNumber: "32351553",
      OrderStatusUIName: "Sent",
      OrderStatusID: 5,
      DeliveryDateUTC: "2026/06/03 10:00:00",
      Items: [{ SKU: "keep-me" }],
    };
    const source: Record<string, unknown> = {
      OrderStatus: "Confirmed by vendor",
      OrderStatusID: 2,
      OrderStatusUIName: "Confirmed by supplier",
      HistoryLog: [{ ActionTitle: "Confirmed by supplier" }],
      DeliveryDateUTC: "2026/06/03 16:00:00",
    };

    const changed = copyMarketManOrderStatusOntoRaw(target, source);
    assert.equal(changed, true);
    assert.equal(target.OrderStatusUIName, "Confirmed by supplier");
    assert.equal(target.OrderStatusID, 2);
    assert.equal(target.DeliveryDateUTC, "2026/06/03 10:00:00");
    assert.deepEqual(target.Items, [{ SKU: "keep-me" }]);
    assert.ok(Array.isArray(target.HistoryLog));
  });

  it("copyMarketManOrderStatusOntoRaw returns false when nothing changes", () => {
    const target: Record<string, unknown> = {
      OrderStatusUIName: "Sent",
      OrderStatusID: 5,
    };
    const source: Record<string, unknown> = {
      OrderStatusUIName: "Sent",
      OrderStatusID: 5,
    };
    assert.equal(copyMarketManOrderStatusOntoRaw(target, source), false);
  });
});
