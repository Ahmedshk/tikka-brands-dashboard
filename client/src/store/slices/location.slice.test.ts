import assert from 'node:assert/strict';
import test from 'node:test';
import reducer, { setLocationCatalog, setScopedLocationSelection, syncLocationCatalog, clearToSingleLocation, resetLocationState } from './location.slice';
import type { LocationListItem } from '../../types';

test('group origin persists across reloads and catalog refresh, and logout clears it', t => {
  const storage = new Map<string, string>();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return storage.size; },
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  const locations = ['a', 'b', 'c'].map(_id => ({ _id, storeName: _id } as LocationListItem));
  let state = reducer(undefined, setLocationCatalog({ locations }));
  state = reducer(state, setScopedLocationSelection({ green: ['a', 'b'], other: ['a'] }));
  assert.deepEqual(state.selectedLocationIds, ['a', 'b']);
  state = reducer(undefined, setLocationCatalog({ locations }));
  assert.deepEqual(state.selectedLocationScopes, { green: ['a', 'b'], other: ['a'] });
  state = reducer(state, syncLocationCatalog({ locations: [locations[0]!, locations[2]!] }));
  assert.deepEqual(state.selectedLocationScopes, { green: ['a'], other: ['a'] });
  state = reducer(state, clearToSingleLocation(locations[2]!));
  assert.equal(state.selectedLocationScopes, null);
  assert.equal(storage.has('tikka_location_selection_scopes'), false);
  state = reducer(state, setScopedLocationSelection({ green: [] }));
  state = reducer(undefined, setLocationCatalog({ locations }));
  assert.deepEqual(state.selectedLocationIds, []);
  assert.deepEqual(state.selectedLocationScopes, {});
  reducer(state, resetLocationState());
  assert.equal(storage.size, 0);
});
