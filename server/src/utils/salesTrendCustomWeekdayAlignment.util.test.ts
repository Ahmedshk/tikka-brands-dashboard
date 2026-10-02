import assert from 'node:assert/strict';
import test from 'node:test';
import { alignCustomComparisonBucketKeys } from './salesTrendCustomWeekdayAlignment.util.js';
import { alignComparisonAndMaskFuture, getPeriodAndComparison } from './salesTrendControllerHelpers.js';
import { getOrderedBucketsAndLabels } from '../services/square.service.js';

const weekdays = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay();

function fixture(timezone = 'America/Denver', start = '2026-08-01', end = '2026-08-31', comparisonStart = '2024-10-01', comparisonEnd = '2024-10-31') {
  const { period, comparison } = getPeriodAndComparison({ locationId: '', periodType: 'custom',
    periodStart: start, periodEnd: end, comparisonType: 'custom', comparisonStart, comparisonEnd,
    comparisonDate: undefined, metric: 'netSales', groupBy: 'none' }, timezone, '04:00');
  assert.ok(comparison);
  const options = { periodType: 'custom', businessStartTime: '04:00' };
  const currentBuckets = getOrderedBucketsAndLabels(period, timezone, 'daily', options);
  const comparisonBuckets = getOrderedBucketsAndLabels(comparison, timezone, 'daily', options);
  return { period, comparison, currentBuckets, comparisonBuckets, timezone };
}

test('custom months pair weekday occurrences rather than calendar dates', () => {
  const { currentBuckets, comparisonBuckets } = fixture();
  const keys = alignCustomComparisonBucketKeys(currentBuckets.keys, comparisonBuckets.keys);
  assert.equal(keys[0], '2024-10-05'); // first Saturday
  assert.equal(keys[2], '2024-10-07'); // first Monday
  assert.equal(keys[3], '2024-10-01'); // first Tuesday, not Friday October 4
  assert.equal(keys[9], '2024-10-14'); // second Monday
  assert.equal(keys[30], ''); // fifth Monday has no match in October
  keys.forEach((key, index) => { if (key) assert.equal(weekdays(key), weekdays(currentBuckets.keys[index]!)); });
  assert.equal(new Set(keys.filter(Boolean)).size, keys.filter(Boolean).length);
});

test('shared metric alignment moves both values and tooltip dates to the matching weekday', () => {
  const f = fixture();
  const comparisonValues = f.comparisonBuckets.keys.map((_, index) => index + 1);
  for (const multiplier of [1, 10, 100]) {
    const result = alignComparisonAndMaskFuture({ currentRange: f.period, comparisonRange: f.comparison,
      timezone: f.timezone, businessStartTime: '04:00', seriesGranularity: 'daily', periodType: 'custom', comparisonType: 'custom',
      xAxisLabels: f.currentBuckets.labels, currentPeriod: f.currentBuckets.keys.map(() => 1000),
      comparisonPeriod: comparisonValues.map(value => value * multiplier),
    });
    assert.equal(result.comparisonPeriod[3], multiplier);
    assert.equal(result.comparisonPeriod[0], 5 * multiplier);
    assert.equal(result.comparisonPeriod[30], null);
    assert.match(result.comparisonPeriodTooltipLabels![3]!, /Tue.*Oct 1.*2024/);
    assert.equal(result.comparisonPeriodTooltipLabels![30], '');
    assert.deepEqual(result.currentPeriod, f.currentBuckets.keys.map(() => 1000));
  }
});

test('custom comparisons retain business-day boundaries across DST and unequal month lengths', () => {
  for (const timezone of ['America/Denver', 'America/New_York', 'Asia/Karachi']) {
    const f = fixture(timezone, '2025-03-01', '2025-03-31', '2025-02-01', '2025-02-28');
    assert.equal(f.currentBuckets.keys.length, 31);
    assert.equal(f.comparisonBuckets.keys.length, 28);
    const keys = alignCustomComparisonBucketKeys(f.currentBuckets.keys, f.comparisonBuckets.keys);
    assert.equal(keys[2], '2025-02-03');
    assert.equal(keys[30], '');
  }
});

test('custom ranges spanning months use weekday occurrences within the selected ranges', () => {
  assert.deepEqual(alignCustomComparisonBucketKeys(['2024-08-31', '2024-09-01', '2024-09-02'],
    ['2024-07-29', '2024-07-30', '2024-07-31', '2024-08-01', '2024-08-02', '2024-08-03', '2024-08-04']),
  ['2024-08-03', '2024-08-04', '2024-07-29']);
});

test('matching dates near the end of a longer comparison range are retained', () => {
  const f = fixture('America/Denver', '2024-09-01', '2024-09-03', '2024-07-29', '2024-08-04');
  const result = alignComparisonAndMaskFuture({ currentRange: f.period, comparisonRange: f.comparison,
    timezone: f.timezone, businessStartTime: '04:00', seriesGranularity: 'daily', periodType: 'custom', comparisonType: 'custom',
    xAxisLabels: f.currentBuckets.labels, currentPeriod: [1, 2, 3], comparisonPeriod: [10, 20, 30, 40, 50, 60, 70],
  });
  assert.deepEqual(result.comparisonPeriod, [70, 10, 20]);
  assert.match(result.comparisonPeriodTooltipLabels![0]!, /Sun.*Aug 4.*2024/);
});

test('preset comparisons continue using their existing positional alignment', () => {
  const f = fixture();
  const values = f.comparisonBuckets.keys.map((_, index) => index);
  const result = alignComparisonAndMaskFuture({ currentRange: f.period, comparisonRange: f.comparison,
    timezone: f.timezone, businessStartTime: '04:00', seriesGranularity: 'daily', periodType: 'last30days',
    comparisonType: 'samePeriodPreviousMonth', xAxisLabels: f.currentBuckets.labels,
    currentPeriod: values, comparisonPeriod: values });
  assert.deepEqual(result.comparisonPeriod, values);
});

test('lastMonth preset pairs weekday occurrences and retains actual comparison tooltip dates', () => {
  const f = fixture('America/Denver', '2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31');
  const values = f.comparisonBuckets.keys.map((_, index) => index + 1);
  const result = alignComparisonAndMaskFuture({ currentRange: f.period, comparisonRange: f.comparison,
    timezone: f.timezone, businessStartTime: '04:00', seriesGranularity: 'daily', periodType: 'lastMonth',
    comparisonType: 'samePeriodPreviousMonth', xAxisLabels: f.currentBuckets.labels,
    currentPeriod: f.currentBuckets.keys.map(() => 1), comparisonPeriod: values });
  assert.equal(result.comparisonPeriod[0], 4); // first Tuesday: September 1 -> August 4
  assert.equal(result.comparisonPeriod[6], 3); // first Monday: September 7 -> August 3
  assert.equal(result.comparisonPeriod[28], null); // fifth Tuesday has no match
  assert.match(result.comparisonPeriodTooltipLabels![0]!, /Tue.*Aug 4.*2026/);
});
