'use strict';
/**
 * Pino transport that wraps `pino-roll` with **exact-level** filtering.
 *
 * Why this exists: pino's transport target `level` option uses *minimum-level*
 * semantics (`level: 'warn'` lets warn + error + fatal through). The winston
 * setup this migration replaces used *exact-level* filters: `application.log`
 * was info-only, `warn.log` was warn-only, etc. To preserve that file layout
 * exactly, each non-master file routes through this transport so only records
 * whose numeric `level` matches `onlyLevel` reach `pino-roll`.
 *
 * Level numbers follow pino's defaults: trace=10, debug=20, info=30,
 * warn=40, error=50, fatal=60. The `onlyLevel` option must be the numeric
 * value, not the label — pino's multi-target multistream dispatcher
 * compares records by numeric level too, so keeping the same units
 * end-to-end avoids the silent-drop failure mode where dispatch sees a
 * stringified level and rejects every record.
 *
 * Worker-thread isolation: this file is CommonJS (`.cjs`) because pino spawns
 * transport workers via `require()` and the project is ESM-only otherwise.
 * `pino-abstract-transport` returns a Transform-like stream pino's worker can
 * consume; backpressure and shutdown semantics come from the underlying
 * `pino-roll` SonicBoom stream we forward to.
 *
 * Options shape: everything except `onlyLevel` is forwarded verbatim to
 * `pino-roll`. See pino-roll's docs for `file`, `frequency`, `dateFormat`,
 * `limit`, `extension`, `mkdir`.
 */
const build = require('pino-abstract-transport');
const pinoRoll = require('pino-roll');

module.exports = async function (opts) {
  const { onlyLevel, ...rollOpts } = opts;
  if (typeof onlyLevel !== 'number') {
    throw new Error(
      `pinoExactLevelTransport: 'onlyLevel' must be the pino numeric level (e.g. 30 for info), got ${typeof onlyLevel}`,
    );
  }
  const rollStream = await pinoRoll(rollOpts);
  return build(
    async function (source) {
      // `source` yields parsed log records (pino-abstract-transport's
      // default JSON.parse-per-line). Pino's main thread writes records
      // with `"level":<number>` so we compare against the numeric
      // `onlyLevel` we received above.
      for await (const obj of source) {
        if (obj && obj.level === onlyLevel) {
          // SonicBoom expects NDJSON — one record per line, trailing newline.
          rollStream.write(JSON.stringify(obj) + '\n');
        }
      }
    },
    {
      close(_err, cb) {
        rollStream.end(() => cb());
      },
    },
  );
};
