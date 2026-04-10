import test from "node:test";
import assert from "node:assert/strict";
import { getLocalTimeHmInTimezone, getLocalTimeHmInTimezoneAt } from "./alertTime.util.js";

test("getLocalTimeHmInTimezoneAt matches getLocalTimeHmInTimezone for same instant", () => {
  const ms = Date.UTC(2026, 3, 10, 15, 30, 0);
  const at = getLocalTimeHmInTimezoneAt("America/Denver", ms);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  const expected = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  assert.equal(at, expected);
});

test("getLocalTimeHmInTimezone uses wall clock (non-deterministic shape)", () => {
  const hm = getLocalTimeHmInTimezone("America/Denver");
  assert.match(hm, /^\d{2}:\d{2}$/);
});
