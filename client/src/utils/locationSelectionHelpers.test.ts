import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_LOCATIONS_ID,
  EMPTY_SELECTION_MARKER,
  buildLocationApiParams,
  defaultInitialSelection,
  formatLocationTriggerLabel,
  hasLocationSelection,
  normalizeSelection,
  parseStoredLocationSelection,
  serializeSelectedLocationIds,
  toggleAllLocationsSelection,
} from './locationSelectionHelpers';

const AVAILABLE = ['a', 'b', 'c'];

test('normalizeSelection: an empty result is preserved, not back-filled', () => {
  // Core behaviour change: unchecking everything stays unchecked.
  assert.deepEqual(normalizeSelection([], AVAILABLE), []);
});

test('normalizeSelection: unknown ids are dropped, leaving an empty result', () => {
  assert.deepEqual(normalizeSelection(['gone', 'also-gone'], AVAILABLE), []);
});

test('normalizeSelection: dedupes and keeps available ids in order', () => {
  assert.deepEqual(normalizeSelection(['c', 'a', 'a', 'nope'], AVAILABLE), ['c', 'a']);
});

test('defaultInitialSelection: a first visit with no preference picks the first location', () => {
  assert.deepEqual(defaultInitialSelection([], AVAILABLE), ['a']);
});

test('defaultInitialSelection: an existing preference is respected', () => {
  assert.deepEqual(defaultInitialSelection(['c'], AVAILABLE), ['c']);
});

test('defaultInitialSelection: no available locations yields an empty selection', () => {
  assert.deepEqual(defaultInitialSelection([], []), []);
});

test('serializeSelectedLocationIds: an empty selection persists as an explicit marker', () => {
  // Without the marker the key would be dropped and the next load would look
  // like a first visit, silently re-selecting the first location.
  assert.equal(serializeSelectedLocationIds([]), EMPTY_SELECTION_MARKER);
});

test('serializeSelectedLocationIds: round-trips a cleared selection', () => {
  const stored = serializeSelectedLocationIds([]);
  assert.deepEqual(parseStoredLocationSelection(stored, AVAILABLE), []);
});

test('parseStoredLocationSelection: a cleared selection survives unrelated reloads', () => {
  const stored = serializeSelectedLocationIds([]);
  assert.deepEqual(parseStoredLocationSelection(stored, AVAILABLE), []);
  assert.deepEqual(parseStoredLocationSelection(stored, AVAILABLE), []);
});

test('parseStoredLocationSelection: a first visit with no stored key defaults to the first', () => {
  assert.deepEqual(parseStoredLocationSelection(null, AVAILABLE), ['a']);
  assert.deepEqual(parseStoredLocationSelection('', AVAILABLE), ['a']);
});

test('parseStoredLocationSelection: a stale id no longer available falls back to first', () => {
  assert.deepEqual(parseStoredLocationSelection('deleted-id', AVAILABLE), ['a']);
});

test('parseStoredLocationSelection: the all-locations sentinel still expands', () => {
  assert.deepEqual(parseStoredLocationSelection(ALL_LOCATIONS_ID, AVAILABLE), AVAILABLE);
});

test('buildLocationApiParams: an empty selection sends no location params', () => {
  // This is what makes every page's hasLocationSelection gate false.
  assert.deepEqual(buildLocationApiParams([], AVAILABLE.length), {});
  assert.equal(hasLocationSelection(buildLocationApiParams([], 3)), false);
});

test('buildLocationApiParams: a non-empty selection still produces params', () => {
  assert.equal(hasLocationSelection(buildLocationApiParams(['a'], 3)), true);
  assert.equal(hasLocationSelection(buildLocationApiParams(['a', 'b'], 3)), true);
});

test('hasLocationSelection: an empty locationIds array is not a selection', () => {
  assert.equal(hasLocationSelection({ locationIds: [] }), false);
});

test('toggleAllLocationsSelection: with everything checked, clicking clears to empty', () => {
  // Regression guard: this used to collapse to the first location instead of
  // clearing, because an empty selection was previously unreachable.
  assert.deepEqual(toggleAllLocationsSelection(['a', 'b', 'c'], AVAILABLE), []);
});

test('toggleAllLocationsSelection: with nothing checked, clicking selects everything', () => {
  assert.deepEqual(toggleAllLocationsSelection([], AVAILABLE), AVAILABLE);
});

test('toggleAllLocationsSelection: a partial selection is completed, not cleared', () => {
  assert.deepEqual(toggleAllLocationsSelection(['a'], AVAILABLE), AVAILABLE);
});

test('toggleAllLocationsSelection: with no locations available, stays empty', () => {
  assert.deepEqual(toggleAllLocationsSelection([], []), []);
});

test('toggleAllLocationsSelection: the round trip returns to the original state', () => {
  const all = toggleAllLocationsSelection([], AVAILABLE);
  assert.deepEqual(toggleAllLocationsSelection(all, AVAILABLE), []);
});

test('formatLocationTriggerLabel: an empty selection prompts instead of naming a location', () => {
  const locations = [
    { _id: 'a', storeName: 'Store A', address: '', timezone: 'UTC', businessStartTime: '04:00' },
  ];
  assert.equal(formatLocationTriggerLabel([], locations, 1), 'Select location');
});
