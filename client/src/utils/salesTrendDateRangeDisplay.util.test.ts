import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSalesTrendPeriodDateRangeDisplay, formatSalesTrendComparisonDateRangeDisplay } from './salesTrendDateRangeDisplay.util';

test('completed period labels use the location date, including a different host date', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-02T01:00:00Z') }); // October 1 in Denver
  const timezone = 'America/Denver';
  assert.equal(formatSalesTrendPeriodDateRangeDisplay({ periodType: 'yesterday' }, null, timezone), '09/30/26');
  assert.equal(formatSalesTrendPeriodDateRangeDisplay({ periodType: 'lastWeek' }, null, timezone), '09/20/26 – 09/26/26');
  assert.equal(formatSalesTrendPeriodDateRangeDisplay({ periodType: 'lastMonth' }, null, timezone), '09/01/26 – 09/30/26');
  assert.equal(formatSalesTrendPeriodDateRangeDisplay({ periodType: 'lastYear' }, null, timezone), '01/01/25 – 12/31/25');
});

test('last month comparison label includes the entire longer comparison month', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-02T16:00:00Z') });
  assert.equal(formatSalesTrendComparisonDateRangeDisplay({ periodType: 'lastMonth' },
    { comparisonType: 'samePeriodPreviousMonth' }, null, 'America/Denver'), '08/01/26 – 08/31/26');
});

test('completed periods display API weekday-aligned comparison dates', () => {
  assert.equal(formatSalesTrendComparisonDateRangeDisplay({ periodType: 'yesterday' },
    { comparisonType: 'samePeriodPreviousMonth' }, { startAt: '2026-09-03T06:00:00Z', endAt: '2026-09-04T05:59:59Z' },
    'America/Denver'), '09/03/26');
});
