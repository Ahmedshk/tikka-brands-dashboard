import assert from 'node:assert/strict';
import test from 'node:test';
import { Types } from 'mongoose';
import { GoogleBusinessReviewModel } from '../models/googleBusinessReview.model.js';
import { GoogleBusinessLocationSyncStateModel } from '../models/googleBusinessLocationSyncState.model.js';
import { getReviewRatingBreakdownForLocations, summarizeReviewGroups } from './googleBusinessReviewAggregation.util.js';
import { getBusinessStartTimeRange } from './timezone.util.js';
import type { LocationForKpi } from '../types/commandCenter.types.js';

const ids = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012', '507f1f77bcf86cd799439013'];
const oid = (index: number) => new Types.ObjectId(ids[index]!);

test('combined ratings use raw review sums instead of rounded location averages', () => {
  const result = summarizeReviewGroups([{ _id: oid(0), count: 3, sum: 13 }, { _id: oid(1), count: 1, sum: 4 }]);
  assert.deepEqual(result.combined, { averageRating: 4.3, reviewCount: 4 });
  assert.deepEqual(result.byLocation.get(ids[0]!), { averageRating: 4.3, reviewCount: 3 });
  assert.deepEqual(summarizeReviewGroups([]).combined, { averageRating: null, reviewCount: 0 });
});

test('five grouped period reads supply all locations and totals, honoring each timezone', async t => {
  const locations: LocationForKpi[] = ['America/Denver', 'Asia/Tokyo', 'UTC'].map(timezone => ({ timezone,
    businessStartTime: '04:00', squareLocationId: null, homebaseLocationId: null }));
  let queries = 0;
  t.mock.method(GoogleBusinessReviewModel, 'aggregate', async (pipeline: Array<Record<string, unknown>>) => {
    const match = pipeline[0]!.$match as { $or: Array<{ locationId: Types.ObjectId; createTime: { $gte: Date; $lte: Date } }> };
    assert.deepEqual(match.$or.map(clause => String(clause.locationId)), ids);
    assert.deepEqual(pipeline[1]!.$group, { _id: '$locationId', count: { $sum: 1 }, sum: { $sum: '$starRatingNumeric' } });
    if (queries++ === 0) {
      for (let index = 0; index < locations.length; index++) {
        const range = getBusinessStartTimeRange(locations[index]!.timezone, '04:00');
        assert.equal(match.$or[index]!.createTime.$gte.toISOString(), range.startAt);
        assert.equal(match.$or[index]!.createTime.$lte.toISOString(), range.endAt);
      }
    }
    return [{ _id: oid(0), count: 3, sum: 13 }, { _id: oid(1), count: 1, sum: 4 }];
  });
  let stateQueries = 0;
  t.mock.method(GoogleBusinessLocationSyncStateModel, 'find', (filter: Record<string, unknown>) => {
    stateQueries++;
    assert.deepEqual(filter, { locationId: { $in: ids.map(id => new Types.ObjectId(id)) }, lastSyncStatus: 'success' });
    return { select: () => ({ lean: async () => [
      { locationId: oid(0), googleAverageRating: 4, googleTotalReviewCount: 10 },
      { locationId: oid(1), googleAverageRating: 5, googleTotalReviewCount: 30 },
    ] }) };
  });
  const result = await getReviewRatingBreakdownForLocations([...ids, ids[0]!], [...locations, locations[0]!]);
  assert.equal(queries, 5);
  assert.equal(stateQueries, 1);
  assert.equal(result.byLocation.size, 3);
  assert.deepEqual(result.combined.today, { averageRating: 4.3, reviewCount: 4 });
  assert.deepEqual(result.combined.overall, { averageRating: 4.8, reviewCount: 40 });
  assert.deepEqual(result.byLocation.get(ids[2]!)!.today, { averageRating: null, reviewCount: 0 });
  assert.deepEqual(result.byLocation.get(ids[0]!)!.overall, { averageRating: 4, reviewCount: 10 });
});
