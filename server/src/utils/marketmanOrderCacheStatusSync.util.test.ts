import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MarketManOrderCacheModel } from "../models/marketmanOrderCache.model.js";
import {
  copyMarketManOrderStatusOntoRaw,
  reconcileMarketManOrderStatusWithSibling,
  siblingMarketManApiKind,
} from "./marketmanOrderCacheStatusSync.util.js";

function chainExec<T>(value: T) {
  return { exec: async () => value };
}

describe("marketmanOrderCacheStatusSync", () => {
  afterEach(() => {
    mock.restoreAll();
  });

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

  describe("reconcileMarketManOrderStatusWithSibling", () => {
    const buyerGuid = "15a113bbabf04d5b8ddb2b14299603f3";
    const orderNumber = "32409340";

    it("returns sibling_missing when sibling row does not exist", async () => {
      mock.method(MarketManOrderCacheModel, "findOne", () => chainExec(null));
      const updateOne = mock.method(MarketManOrderCacheModel, "updateOne", () =>
        chainExec({ modifiedCount: 1 }),
      );

      const result = await reconcileMarketManOrderStatusWithSibling({
        buyerGuid,
        orderNumber,
        sourceApiKind: "sent",
        sourceOrderRaw: {
          OrderStatusUIName: "Confirmed by supplier",
          OrderStatusID: 2,
        },
        sourceFetchedAt: new Date("2026-06-04T05:45:17Z"),
      });

      assert.equal(result.reconciled, false);
      assert.equal(result.reason, "sibling_missing");
      assert.equal(updateOne.mock.callCount(), 0);
    });

    it("source newer updates sibling status and sibling fetchedAt", async () => {
      const siblingId = new mongoose.Types.ObjectId();
      const sourceFetchedAt = new Date("2026-06-04T05:45:17Z");

      mock.method(MarketManOrderCacheModel, "findOne", (filter: { apiKind?: string }) => {
        if (filter.apiKind === "delivery") {
          return chainExec({
            _id: siblingId,
            fetchedAt: new Date("2026-06-03T21:19:14Z"),
            raw: {
              OrderStatusUIName: "Sent",
              OrderStatusID: 5,
              DeliveryDateUTC: "2026/06/03 10:00:00",
            },
          });
        }
        return chainExec(null);
      });

      const updateOne = mock.method(MarketManOrderCacheModel, "updateOne", () =>
        chainExec({ modifiedCount: 1 }),
      );

      const result = await reconcileMarketManOrderStatusWithSibling({
        buyerGuid,
        orderNumber,
        sourceApiKind: "sent",
        sourceOrderRaw: {
          OrderStatus: "Confirmed by vendor",
          OrderStatusUIName: "Confirmed by supplier",
          OrderStatusID: 2,
        },
        sourceFetchedAt,
      });

      assert.equal(result.reconciled, true);
      assert.equal(result.updatedTarget, "sibling");
      assert.equal(updateOne.mock.callCount(), 1);
      const firstCall = updateOne.mock.calls[0];
      assert.ok(firstCall);
      const update = firstCall.arguments[1] as {
        $set: { raw: Record<string, unknown>; fetchedAt: Date };
      };
      assert.equal(update.$set.raw.OrderStatusUIName, "Confirmed by supplier");
      assert.equal(update.$set.raw.DeliveryDateUTC, "2026/06/03 10:00:00");
      assert.equal(update.$set.fetchedAt.getTime(), sourceFetchedAt.getTime());
    });

    it("sibling newer updates source row from sibling status", async () => {
      const sourceId = new mongoose.Types.ObjectId();
      const siblingId = new mongoose.Types.ObjectId();
      const siblingFetchedAt = new Date("2026-06-04T08:00:00Z");

      mock.method(MarketManOrderCacheModel, "findOne", (filter: { apiKind?: string }) => {
        if (filter.apiKind === "delivery") {
          return chainExec({
            _id: siblingId,
            fetchedAt: siblingFetchedAt,
            raw: {
              OrderStatusUIName: "Delivered",
              OrderStatusID: 9,
            },
          });
        }
        if (filter.apiKind === "sent") {
          return chainExec({
            _id: sourceId,
            fetchedAt: new Date("2026-06-04T05:00:00Z"),
            raw: {
              OrderStatusUIName: "Confirmed by supplier",
              OrderStatusID: 2,
            },
          });
        }
        return chainExec(null);
      });

      const updateOne = mock.method(MarketManOrderCacheModel, "updateOne", () =>
        chainExec({ modifiedCount: 1 }),
      );

      const result = await reconcileMarketManOrderStatusWithSibling({
        buyerGuid,
        orderNumber,
        sourceApiKind: "sent",
        sourceOrderRaw: {
          OrderStatusUIName: "Confirmed by supplier",
          OrderStatusID: 2,
        },
        sourceFetchedAt: new Date("2026-06-04T05:00:00Z"),
      });

      assert.equal(result.reconciled, true);
      assert.equal(result.updatedTarget, "source");
      assert.equal(updateOne.mock.callCount(), 1);
      const firstCall = updateOne.mock.calls[0];
      assert.ok(firstCall);
      const filter = firstCall.arguments[0] as unknown as { _id: mongoose.Types.ObjectId };
      const update = firstCall.arguments[1] as unknown as {
        $set: { raw: Record<string, unknown>; fetchedAt: Date };
      };
      assert.equal(String(filter._id), String(sourceId));
      assert.equal(update.$set.raw.OrderStatusUIName, "Delivered");
      assert.equal(update.$set.fetchedAt.getTime(), siblingFetchedAt.getTime());
    });

    it("equal fetchedAt and same status returns unchanged without update", async () => {
      const t = new Date("2026-06-04T05:45:17Z");
      mock.method(MarketManOrderCacheModel, "findOne", () =>
        chainExec({
          _id: new mongoose.Types.ObjectId(),
          fetchedAt: t,
          raw: {
            OrderStatusUIName: "Confirmed by supplier",
            OrderStatusID: 2,
          },
        }),
      );
      const updateOne = mock.method(MarketManOrderCacheModel, "updateOne", () =>
        chainExec({ modifiedCount: 1 }),
      );

      const result = await reconcileMarketManOrderStatusWithSibling({
        buyerGuid,
        orderNumber,
        sourceApiKind: "sent",
        sourceOrderRaw: {
          OrderStatusUIName: "Confirmed by supplier",
          OrderStatusID: 2,
        },
        sourceFetchedAt: t,
      });

      assert.equal(result.reconciled, false);
      assert.equal(result.reason, "unchanged");
      assert.equal(updateOne.mock.callCount(), 0);
    });
  });
});
