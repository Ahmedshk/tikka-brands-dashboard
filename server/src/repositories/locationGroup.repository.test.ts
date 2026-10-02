import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { LocationModel } from '../models/location.model.js';
import { LocationGroupRepository } from './locationGroup.repository.js';

const ids = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'];
const oid = (index: number) => new mongoose.Types.ObjectId(ids[index]!);

test('group member resolution includes overlapping and legacy memberships, once per requested group', async t => {
  t.mock.method(LocationModel, 'find', (query: Record<string, unknown>) => {
    assert.deepEqual(query.$or, [{ groupIds: { $in: [oid(0), oid(1)] } }, { groupId: { $in: [oid(0), oid(1)] } }]);
    return { select: () => ({ sort: () => ({ lean: () => ({ exec: async () => [
      { _id: oid(2), groupIds: [oid(0), oid(1)], groupId: oid(0) },
      { _id: oid(1), groupId: oid(0) },
      { _id: oid(0), groupIds: [oid(1), oid(2)] },
    ] }) }) }) };
  });
  const members = await new LocationGroupRepository().findMemberIdsByGroupIds([ids[0]!, ids[1]!]);
  assert.deepEqual(members.get(ids[0]!), [ids[2], ids[1]]);
  assert.deepEqual(members.get(ids[1]!), [ids[2], ids[0]]);
  assert.equal(members.has(ids[2]!), false, 'other group IDs are not exposed');
});

test('overlapping group reads retain the location access filter', async t => {
  t.mock.method(LocationModel, 'find', (query: Record<string, unknown>) => {
    assert.deepEqual(query.$and, [{ _id: { $in: [oid(2)] } }]);
    return { select: () => ({ sort: () => ({ lean: () => ({ exec: async () => [
      { _id: oid(2), groupIds: [oid(0), oid(1)] },
    ] }) }) }) };
  });
  const members = await new LocationGroupRepository().findMemberIdsByGroupIds([ids[0]!, ids[1]!], { allowedIds: [ids[2]!] });
  assert.deepEqual([...members.values()], [[ids[2]], [ids[2]]]);
});
