import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { locationGroupIds } from './locationGroupMembership.util.js';
import { assignLocationGroupSchema } from '../validators/locationGroup.validators.js';

const groupId = '507f1f77bcf86cd799439011';

test('existing single-group locations retain their membership', () => {
  assert.deepEqual(locationGroupIds({ groupId: new mongoose.Types.ObjectId(groupId) }), [groupId]);
  assert.deepEqual(locationGroupIds({ groupIds: [], groupId }), [groupId]);
});

test('multi-group membership merges legacy assignments without duplicates', () => {
  const second = '507f1f77bcf86cd799439012';
  assert.deepEqual(locationGroupIds({ groupIds: [groupId, second, groupId], groupId }), [groupId, second]);
  assert.deepEqual(locationGroupIds({}), []);
  assert.deepEqual(locationGroupIds({ groupId: null }), []);
});

test('membership API supports adding and removing a specific group and rejects accidental clears', () => {
  const params = { id: '507f1f77bcf86cd799439013' };
  assert.equal(assignLocationGroupSchema.parse({ params, body: { groupId } }).body.action, 'add');
  assert.equal(assignLocationGroupSchema.parse({ params, body: { groupId, action: 'remove' } }).body.action, 'remove');
  assert.ok(assignLocationGroupSchema.safeParse({ params, body: { groupId: null } }).success);
  for (const body of [{}, { groupId: '' }, { groupId: 'invalid' }, { groupId, action: 'move' }]) {
    assert.equal(assignLocationGroupSchema.safeParse({ params, body }).success, false);
  }
});
