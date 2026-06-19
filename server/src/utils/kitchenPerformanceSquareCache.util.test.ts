import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  _clearKitchenPerformanceSquareCacheForTests,
  buildKitchenPerformanceListCacheKey,
  loadKitchenPerformanceListCached,
} from "./kitchenPerformanceSquareCache.util.js";

describe("kitchenPerformanceSquareCache", () => {
  it("dedupes inflight list loads for the same key", async () => {
    _clearKitchenPerformanceSquareCacheForTests();
    let loadCount = 0;

    const loader = async () => {
      loadCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [{ deviceName: "Expo", type: "Expeditor", location: "A", completedTickets: 1, avgCompletionTimeSeconds: 10 }];
    };

    const key = buildKitchenPerformanceListCacheKey("loc-1", "2026-06-01", "2026-06-07");
    const [a, b] = await Promise.all([
      loadKitchenPerformanceListCached(key, loader),
      loadKitchenPerformanceListCached(key, loader),
    ]);

    assert.equal(loadCount, 1);
    assert.equal(a[0]?.deviceName, "Expo");
    assert.equal(b[0]?.deviceName, "Expo");
  });

  it("serves fresh resolved list without re-running loader", async () => {
    _clearKitchenPerformanceSquareCacheForTests();
    let loadCount = 0;
    const key = buildKitchenPerformanceListCacheKey("loc-2", "2026-06-01", "2026-06-01");
    const loader = async () => {
      loadCount += 1;
      return [{ deviceName: "Prep", type: "Prep", location: "B", completedTickets: 2, avgCompletionTimeSeconds: 5 }];
  };

    await loadKitchenPerformanceListCached(key, loader);
    await loadKitchenPerformanceListCached(key, loader);
    assert.equal(loadCount, 1);
  });
});
