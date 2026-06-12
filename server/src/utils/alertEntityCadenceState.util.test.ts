import assert from "node:assert/strict";
import test from "node:test";
import { buildEpisodeCadenceUpsertUpdate } from "./alertEntityCadenceState.util.js";

const tickMs = Date.parse("2026-06-12T15:00:00.000Z");
const episodeStart = new Date(tickMs);

test("buildEpisodeCadenceUpsertUpdate omits $setOnInsert when episode starts in $set", () => {
  const update = buildEpisodeCadenceUpsertUpdate(
    {
      shouldSend: true,
      fireKey: "k",
      nextEpisodeStartedAt: episodeStart,
      nextLastAlertedAt: episodeStart,
    },
    tickMs,
    { isActive: true },
  );
  assert.equal(update.$set.episodeStartedAt, episodeStart);
  assert.equal(update.$setOnInsert, undefined);
});

test("buildEpisodeCadenceUpsertUpdate uses $setOnInsert only when episode not in $set", () => {
  const update = buildEpisodeCadenceUpsertUpdate(
    {
      shouldSend: false,
      fireKey: "",
      nextEpisodeStartedAt: null,
      nextLastAlertedAt: null,
    },
    tickMs,
    { isActive: true },
  );
  assert.equal(update.$set.episodeStartedAt, undefined);
  const inserted = update.$setOnInsert?.episodeStartedAt as Date;
  assert.equal(inserted.getTime(), tickMs);
});
