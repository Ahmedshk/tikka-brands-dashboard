import test from 'node:test';
import assert from 'node:assert/strict';
import { buildListMatchQuery } from '../repositories/location.repository.js';
import { locationListFilterForUser } from './locationAccessFilter.util.js';
import { locationScopeForIds } from './dashboardCacheScope.util.js';

function isPlainObject(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

test('locationListFilterForUser: "all" with no removals means unrestricted', () => {
  assert.equal(locationListFilterForUser({ allowedLocationIds: 'all' }), undefined);
});

test('locationListFilterForUser: an explicit allow-list produces allowedIds', () => {
  const filter = locationListFilterForUser({ allowedLocationIds: ['a', 'b'] });
  assert.deepEqual(filter, { allowedIds: ['a', 'b'] });
});

test('locationListFilterForUser: removals are carried even when access is "all"', () => {
  const filter = locationListFilterForUser({
    allowedLocationIds: 'all',
    locationRemovals: ['x'],
  });
  assert.deepEqual(filter, { excludeIds: ['x'] });
});

test('locationListFilterForUser: allow-list and removals combine', () => {
  const filter = locationListFilterForUser({
    allowedLocationIds: ['a', 'b'],
    locationRemovals: ['b'],
  });
  assert.deepEqual(filter, { allowedIds: ['a', 'b'], excludeIds: ['b'] });
});

test('locationListFilterForUser: an undefined user is unrestricted', () => {
  assert.equal(locationListFilterForUser(undefined), undefined);
});

test('locationListFilterForUser: an empty removals array adds no clause', () => {
  assert.equal(
    locationListFilterForUser({ allowedLocationIds: 'all', locationRemovals: [] }),
    undefined,
  );
});

test('buildListMatchQuery: an explicit allow-list becomes an $in on _id', () => {
  const ids = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];
  const match = buildListMatchQuery({ allowedIds: ids });
  assert.ok(isPlainObject(match));
  const clause = (match as Record<string, { $in?: unknown[] }>)._id;
  assert.ok(Array.isArray(clause?.$in));
  assert.equal(clause?.$in?.length, 2);
});

test('buildListMatchQuery: allowed plus excluded becomes an $and', () => {
  const allowed = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];
  const excluded = ['507f1f77bcf86cd799439012'];
  const match = buildListMatchQuery({ allowedIds: allowed, excludeIds: excluded });
  assert.ok(Array.isArray(match.$and));
  assert.equal(match.$and.length, 2);
});

test('buildListMatchQuery: invalid ids are dropped rather than matching nothing', () => {
  const match = buildListMatchQuery({
    allowedIds: ['not-an-objectid', '507f1f77bcf86cd799439011'],
  });
  const clause = (match as Record<string, { $in?: unknown[] }>)._id;
  assert.equal(clause?.$in?.length, 1);
});

test('locationScopeForIds: the same id set hashes identically regardless of order', () => {
  const a = locationScopeForIds(['a', 'b', 'c']);
  const b = locationScopeForIds(['c', 'a', 'b']);
  assert.equal(a, b);
});

test('locationScopeForIds: different id sets produce different scopes', () => {
  assert.notEqual(locationScopeForIds(['a', 'b']), locationScopeForIds(['a', 'c']));
});

test('locationScopeForIds: a one-location group is still prefixed, unlike a live request', () => {
  // This mismatch is why the cron skips single-member groups: the live path
  // returns the bare id for a single-location request, so a seeded
  // `__all__|<hash>` entry for the same id would never be read.
  assert.ok(locationScopeForIds(['a']).startsWith('__all__|'));
});

test('locationScopeForIds: the scope is stable and prefixed for multi-id groups', () => {
  const scope = locationScopeForIds(['a', 'b']);
  assert.ok(scope.startsWith('__all__|'));
  assert.equal(scope, locationScopeForIds(['b', 'a']));
});
