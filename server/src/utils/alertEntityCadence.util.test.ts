import assert from "node:assert/strict";
import test from "node:test";
import { computeAlertEntityCadenceSendPlan } from "./alertEntityCadence.util.js";

const tickMs = Date.parse("2026-06-12T15:00:00.000Z");
const dayKey = "2026-06-12";
const tickFireKey = `${dayKey}|i100`;
const suffix = "order:PO-1";

test("computeAlertEntityCadenceSendPlan every_run always sends with tick key", () => {
  const plan = computeAlertEntityCadenceSendPlan(
    "every_run",
    { isActive: true, lastAlertedAt: new Date() },
    dayKey,
    tickFireKey,
    tickMs,
    suffix,
  );
  assert.equal(plan.shouldSend, true);
  assert.equal(plan.fireKey, `${tickFireKey}|${suffix}`);
});

test("computeAlertEntityCadenceSendPlan once_per_day uses day key", () => {
  const plan = computeAlertEntityCadenceSendPlan(
    "once_per_day",
    undefined,
    dayKey,
    tickFireKey,
    tickMs,
    suffix,
  );
  assert.equal(plan.shouldSend, true);
  assert.equal(plan.fireKey, `${dayKey}|${suffix}`);
});

test("computeAlertEntityCadenceSendPlan once_per_episode sends once then suppresses", () => {
  const first = computeAlertEntityCadenceSendPlan(
    "once_per_episode",
    undefined,
    dayKey,
    tickFireKey,
    tickMs,
    suffix,
  );
  assert.equal(first.shouldSend, true);

  const second = computeAlertEntityCadenceSendPlan(
    "once_per_episode",
    {
      isActive: true,
      episodeStartedAt: first.nextEpisodeStartedAt,
      lastAlertedAt: first.nextLastAlertedAt,
    },
    dayKey,
    tickFireKey,
    tickMs + 60_000,
    suffix,
  );
  assert.equal(second.shouldSend, false);
});
