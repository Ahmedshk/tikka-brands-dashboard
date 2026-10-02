import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocationGroup, LocationListItem } from '../types';
import { bucketLocationsByGroup, groupCheckboxState } from './locationGroupHelpers';
import { resolveSelectionScopes, selectedIdsFromScopes, selectionLabelBuckets, toggleScopeMembers } from './locationScopedSelection';

const locations = ['stackers4', 'kukri2', 'stackers1', 'kukri3'].map(_id => ({ _id, storeName: _id } as LocationListItem));
const groups = [
  { _id: 'stackers', name: 'Stackers', locationIds: ['stackers1', 'stackers4'], sortOrder: 0 },
  { _id: 'kukri', name: 'KüKri', locationIds: ['kukri2', 'kukri3'], sortOrder: 1 },
  { _id: 'green', name: 'Green Jeans', locationIds: ['stackers4', 'kukri2'], sortOrder: 2 },
  { _id: 'tin', name: 'Tin Can Alley', locationIds: ['stackers4', 'kukri3'], sortOrder: 3 },
] satisfies LocationGroup[];
const buckets = bucketLocationsByGroup(locations, groups);

test('selecting Green Jeans marks only its rows and header', () => {
  const scopes = toggleScopeMembers({}, 'green', groups[2]!.locationIds);
  assert.deepEqual(selectedIdsFromScopes(scopes), ['stackers4', 'kukri2']);
  for (const group of groups) {
    assert.equal(groupCheckboxState(scopes[group._id] ?? [], group.locationIds), group._id === 'green' ? 'checked' : 'unchecked');
  }
  assert.deepEqual(selectionLabelBuckets(scopes, buckets.groups).map(b => b.group.name), ['Green Jeans']);
});

test('overlapping groups can be selected and unchecked independently without double counting', () => {
  let scopes = toggleScopeMembers({}, 'green', groups[2]!.locationIds);
  scopes = toggleScopeMembers(scopes, 'stackers', groups[0]!.locationIds);
  assert.deepEqual(selectedIdsFromScopes(scopes), ['stackers4', 'kukri2', 'stackers1']);
  scopes = toggleScopeMembers(scopes, 'green', ['stackers4']);
  assert.deepEqual(scopes.green, ['kukri2']);
  assert.deepEqual(scopes.stackers, ['stackers1', 'stackers4']);
  assert.ok(selectedIdsFromScopes(scopes).includes('stackers4'));
  scopes = toggleScopeMembers(scopes, 'stackers', groups[0]!.locationIds);
  assert.deepEqual(selectedIdsFromScopes(scopes), ['kukri2']);
});

test('legacy selections resolve to one section and saved scopes survive reordered groups', () => {
  assert.deepEqual(resolveSelectionScopes(['stackers4', 'kukri2'], null, buckets), { green: ['stackers4', 'kukri2'] });
  const saved = { green: ['stackers4'], stackers: ['stackers4'] };
  assert.deepEqual(resolveSelectionScopes(['stackers4'], saved, { ...buckets, groups: [...buckets.groups].reverse() }), saved);
});

test('deleted memberships relocate selected locations to a visible section without mirrored checks', () => {
  const nextBuckets = bucketLocationsByGroup(locations, groups.filter(g => g._id !== 'green'));
  const scopes = resolveSelectionScopes(['stackers4', 'kukri2'], { green: ['stackers4', 'kukri2'] }, nextBuckets);
  assert.deepEqual(scopes, { stackers: ['stackers4'], kukri: ['kukri2'] });
  assert.deepEqual(resolveSelectionScopes([], {}, buckets), {});
});
