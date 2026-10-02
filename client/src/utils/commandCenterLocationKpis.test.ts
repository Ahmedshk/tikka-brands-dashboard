import assert from 'node:assert/strict';
import test from 'node:test';
import { locationKpisForSelection } from './commandCenterLocationKpis';
import { buildCommandCenterKPIItems } from './commandCenterKpiBuilder';
import type { CommandCenterKPIsDataMulti } from '../services/commandCenter.service';

test('included breakdown uses only selected locations, once each and in selection order', () => {
  const response = [
    { locationId: 'a', kpis: { netSalesToday: 100 } },
    { locationId: 'b', kpis: { netSalesToday: 200 } },
    { locationId: 'other', kpis: { netSalesToday: 300 } },
  ];
  assert.deepEqual(locationKpisForSelection(response, ['b', 'a', 'b']), [response[1], response[0]]);
  assert.deepEqual(locationKpisForSelection(response, []), []);
});

test('a missing location is unavailable rather than borrowing another location’s values', () => {
  assert.deepEqual(locationKpisForSelection([{ locationId: 'a', kpis: { netSalesToday: 100 } }], ['b']), []);
});

test('location values use the selected period, including a response without today', () => {
  const params = {
    loading: false, canNetSales: true, canLaborCost: true, canReviewRating: true,
    icons: { dollar: null, laborCost: null, starTitle: null, starSubtitle: null },
  };
  const items = buildCommandCenterKPIItems({ ...params, kpiPeriod: 'yesterday', kpis: {
    yesterday: { netSalesYesterday: 150, laborCostYesterday: 25, reviewRating: 4.2, reviewCount: 7 },
  } as CommandCenterKPIsDataMulti });
  assert.equal(items[0]!.value, '$150.00');
  assert.equal(items[1]!.value, '$25.00');
  assert.equal(items[2]!.value, '4.2');
  assert.equal(items[2]!.extra, '7 Reviews');
  assert.equal(items[0]!.timePeriod, 'Yesterday');
  const today = buildCommandCenterKPIItems({ ...params, kpiPeriod: 'today', kpis: { netSalesToday: 0, laborCostToday: null } });
  assert.equal(today[0]!.value, '$0.00');
  assert.equal(today[1]!.value, 'Unavailable');
});
