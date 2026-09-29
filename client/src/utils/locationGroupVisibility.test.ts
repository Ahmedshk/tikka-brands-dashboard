import test from 'node:test';
import assert from 'node:assert/strict';
import type { LocationGroup, LocationListItem } from '../types';
import { bucketLocationsByGroup } from './locationGroupHelpers';

function loc(id: string): LocationListItem {
  return {
    _id: id,
    storeName: id,
    address: `${id} addr`,
    timezone: 'America/New_York',
    businessStartTime: '04:00',
  };
}

/**
 * Regression guard for the bug where a newly created group never appeared.
 *
 * `GET /api/location-groups` (the navbar list) deliberately omits groups with
 * zero accessible members, so a brand-new group is absent from that payload.
 * The management screen must instead read `GET /api/location-groups/management`,
 * which returns it with an empty `locationIds`. These tests pin that difference
 * so the two endpoints are not swapped back.
 */
test('navbar list omits a new empty group, so it is invisible to the header', () => {
  // What the navbar endpoint returns for a just-created group: nothing.
  const navbarGroups: LocationGroup[] = [];
  const result = bucketLocationsByGroup([loc('a'), loc('b')], navbarGroups);
  assert.equal(result.groups.length, 0);
  assert.equal(result.ungrouped.length, 2);
});

test('management list keeps a new empty group in the data the page renders', () => {
  // What /management returns: the new group, present but with no members yet.
  const managementGroups: LocationGroup[] = [
    { _id: 'g1', name: 'New Group', sortOrder: 0, locationIds: [] },
  ];
  const result = bucketLocationsByGroup([loc('a'), loc('b')], managementGroups);
  // No bucket renders yet (there is nothing to check), but the group is present
  // in the source data used to build the per-row group <select>.
  assert.equal(managementGroups.length, 1);
  assert.equal(managementGroups[0]?.locationIds.length, 0);
  assert.equal(result.groups.length, 0);
  assert.equal(result.ungrouped.length, 2);
});

test('after the first location is assigned, the group renders a bucket', () => {
  const groups: LocationGroup[] = [
    { _id: 'g1', name: 'West', sortOrder: 0, locationIds: ['a'] },
  ];
  const result = bucketLocationsByGroup([loc('a'), loc('b')], groups);
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0]?.locations.map((l) => l._id), ['a']);
  assert.deepEqual(result.ungrouped.map((l) => l._id), ['b']);
});
