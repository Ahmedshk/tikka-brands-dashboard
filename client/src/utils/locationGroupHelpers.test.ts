import test from 'node:test';
import assert from 'node:assert/strict';
import type { LocationGroup, LocationListItem } from '../types';
import {
  bucketLocationsByGroup,
  findGroupNameForSelection,
  groupCheckboxState,
  planGroupMembership,
  toggleGroupMembers,
} from './locationGroupHelpers';

function loc(id: string, storeName = id): LocationListItem {
  return {
    _id: id,
    storeName,
    address: `${id} addr`,
    timezone: 'America/New_York',
    businessStartTime: '04:00',
  };
}

function group(id: string, name: string, locationIds: string[], sortOrder = 0): LocationGroup {
  return { _id: id, name, sortOrder, locationIds };
}

test('bucketLocationsByGroup: splits locations by group and leaves the rest ungrouped', () => {
  const result = bucketLocationsByGroup(
    [loc('a'), loc('b'), loc('c'), loc('d')],
    [group('g1', 'West', ['a', 'b'])],
  );
  assert.deepEqual(result.groups.map((b) => b.group.name), ['West']);
  assert.deepEqual(result.groups[0]?.locations.map((l) => l._id), ['a', 'b']);
  assert.deepEqual(result.ungrouped.map((l) => l._id), ['c', 'd']);
});

test('bucketLocationsByGroup: preserves incoming location order within a group', () => {
  const result = bucketLocationsByGroup(
    [loc('b'), loc('a'), loc('c')],
    [group('g1', 'West', ['a', 'b'])],
  );
  // Order follows the location list, not the group's member id order.
  assert.deepEqual(result.groups[0]?.locations.map((l) => l._id), ['b', 'a']);
});

test('bucketLocationsByGroup: orders group buckets by sortOrder, not response order', () => {
  const result = bucketLocationsByGroup(
    [loc('a'), loc('b'), loc('c')],
    [group('g2', 'East', ['c'], 5), group('g1', 'West', ['a', 'b'], 1)],
  );
  assert.deepEqual(result.groups.map((b) => b.group.name), ['West', 'East']);
});

test('bucketLocationsByGroup: omits groups with no visible members', () => {
  // The server already drops empty groups, but a group whose only member is not
  // in the visible list must not render as an empty header.
  const result = bucketLocationsByGroup(
    [loc('a')],
    [group('g1', 'West', ['a']), group('g2', 'Hidden', ['zzz'])],
  );
  assert.deepEqual(result.groups.map((b) => b.group.name), ['West']);
});

test('bucketLocationsByGroup: a location in two groups is claimed by the first only', () => {
  const result = bucketLocationsByGroup(
    [loc('a'), loc('b')],
    [group('g1', 'First', ['a'], 1), group('g2', 'Second', ['a', 'b'], 2)],
  );
  assert.deepEqual(result.groups[0]?.locations.map((l) => l._id), ['a']);
  assert.deepEqual(result.groups[1]?.locations.map((l) => l._id), ['b']);
  assert.deepEqual(result.ungrouped, []);
});

test('bucketLocationsByGroup: every location lands in exactly one bucket', () => {
  const locations = [loc('a'), loc('b'), loc('c'), loc('d'), loc('e')];
  const result = bucketLocationsByGroup(locations, [
    group('g1', 'West', ['a', 'b']),
    group('g2', 'East', ['c']),
  ]);
  const seen = [
    ...result.groups.flatMap((b) => b.locations.map((l) => l._id)),
    ...result.ungrouped.map((l) => l._id),
  ];
  assert.deepEqual([...seen].sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('groupCheckboxState: derives checked, unchecked, and indeterminate', () => {
  assert.equal(groupCheckboxState(['a', 'b'], ['a', 'b']), 'checked');
  assert.equal(groupCheckboxState([], ['a', 'b']), 'unchecked');
  assert.equal(groupCheckboxState(['a'], ['a', 'b']), 'indeterminate');
});

test('groupCheckboxState: extra selected ids outside the group do not affect state', () => {
  assert.equal(groupCheckboxState(['a', 'b', 'z'], ['a', 'b']), 'checked');
});

test('groupCheckboxState: empty group is never checked', () => {
  assert.equal(groupCheckboxState(['a'], []), 'unchecked');
});

test('toggleGroupMembers: checking adds all members and keeps other selections', () => {
  const next = toggleGroupMembers(['z'], ['a', 'b']);
  assert.deepEqual(next.sort(), ['a', 'b', 'z']);
});

test('toggleGroupMembers: unchecking removes every member', () => {
  const next = toggleGroupMembers(['a', 'b', 'z'], ['a', 'b']);
  assert.deepEqual(next, ['z']);
});

test('toggleGroupMembers: partially-selected group checks the remainder', () => {
  const next = toggleGroupMembers(['a'], ['a', 'b']);
  assert.deepEqual(next.sort(), ['a', 'b']);
});

test('toggleGroupMembers: is idempotent-safe against duplicate member ids', () => {
  const next = toggleGroupMembers([], ['a', 'a', 'b']);
  assert.deepEqual(next.sort(), ['a', 'b']);
});

test('findGroupNameForSelection: returns the name when exactly one whole group is selected', () => {
  const buckets = [
    { group: group('g1', 'West', ['a', 'b']), locations: [loc('a'), loc('b')] },
  ];
  assert.equal(findGroupNameForSelection(['a', 'b'], buckets), 'West');
});

test('findGroupNameForSelection: returns null for a partial group selection', () => {
  const buckets = [
    { group: group('g1', 'West', ['a', 'b', 'c']), locations: [loc('a'), loc('b'), loc('c')] },
  ];
  assert.equal(findGroupNameForSelection(['a', 'b'], buckets), null);
});

test('findGroupNameForSelection: returns null when the selection spans groups', () => {
  const buckets = [
    { group: group('g1', 'West', ['a', 'b']), locations: [loc('a'), loc('b')] },
    { group: group('g2', 'East', ['c', 'd']), locations: [loc('c'), loc('d')] },
  ];
  assert.equal(findGroupNameForSelection(['a', 'b', 'c', 'd'], buckets), null);
});

test('findGroupNameForSelection: returns null when a group plus an ungrouped location is selected', () => {
  const buckets = [
    { group: group('g1', 'West', ['a', 'b']), locations: [loc('a'), loc('b')] },
  ];
  assert.equal(findGroupNameForSelection(['a', 'b', 'z'], buckets), null);
});

test('findGroupNameForSelection: a single-member group does match', () => {
  const buckets = [
    { group: group('g1', 'West', ['a']), locations: [loc('a')] },
  ];
  // Selecting the only member *is* selecting that group. The label function
  // never reaches this for a lone selection (it shows the store name instead),
  // but the helper is honest about the semantics.
  assert.equal(findGroupNameForSelection(['a'], buckets), 'West');
});

test('bucketLocationsByGroup: a reordered group list changes the header sequence', () => {
  // Regression guard for drag-to-reorder: `sortOrder` is written by
  // PUT /location-groups/order and read back here, so the header dropdown's group
  // sequence must follow it rather than the response order.
  const locations = [loc('a'), loc('b'), loc('c')];
  const reordered = [
    group('g2', 'East', ['c'], 0),
    group('g1', 'West', ['a', 'b'], 1),
  ];
  const result = bucketLocationsByGroup(locations, reordered);
  assert.deepEqual(result.groups.map((b) => b.group.name), ['East', 'West']);
});

test('bucketLocationsByGroup: reordering is stable when sortOrder is unchanged', () => {
  const locations = [loc('a'), loc('b')];
  const same = [group('g1', 'West', ['a'], 3), group('g2', 'East', ['b'], 3)];
  const result = bucketLocationsByGroup(locations, same);
  // Equal sortOrder falls back to the incoming order rather than reordering
  // arbitrarily, so a tie cannot shuffle the dropdown between renders.
  assert.deepEqual(result.groups.map((b) => b.group.name), ['West', 'East']);
});

test('planGroupMembership: unchanged membership produces no writes', () => {
  const plan = planGroupMembership(['a', 'b'], ['a', 'b']);
  assert.deepEqual(plan.toAdd, []);
  assert.deepEqual(plan.toRelease, []);
});

test('planGroupMembership: newly checked locations are added', () => {
  const plan = planGroupMembership(['a'], ['a', 'b', 'c']);
  assert.deepEqual(plan.toAdd.sort(), ['b', 'c']);
  assert.deepEqual(plan.toRelease, []);
});

test('planGroupMembership: unchecked locations are released to ungrouped', () => {
  const plan = planGroupMembership(['a', 'b', 'c'], ['a']);
  assert.deepEqual(plan.toAdd, []);
  assert.deepEqual(plan.toRelease.sort(), ['b', 'c']);
});

test('planGroupMembership: a move both releases from the old set and adds to the new', () => {
  // 'a' currently belongs to this group and is being handed to another; 'c' is
  // being taken in. Exactly one write per affected location.
  const plan = planGroupMembership(['a', 'b'], ['b', 'c']);
  assert.deepEqual(plan.toAdd, ['c']);
  assert.deepEqual(plan.toRelease, ['a']);
});

test('planGroupMembership: emptying a group releases every member', () => {
  const plan = planGroupMembership(['a', 'b'], []);
  assert.deepEqual(plan.toAdd, []);
  assert.deepEqual(plan.toRelease.sort(), ['a', 'b']);
});

test('planGroupMembership: every affected location is written exactly once', () => {
  const current = ['a', 'b', 'c'];
  const next = ['c', 'd', 'e'];
  const plan = planGroupMembership(current, next);
  const touched = [...plan.toAdd, ...plan.toRelease];
  assert.equal(new Set(touched).size, touched.length);
  // Untouched members are never rewritten.
  assert.ok(!touched.includes('c'));
});

test('findGroupNameForSelection: returns null for an empty selection', () => {
  const buckets = [
    { group: group('g1', 'West', ['a', 'b']), locations: [loc('a'), loc('b')] },
  ];
  assert.equal(findGroupNameForSelection([], buckets), null);
});
