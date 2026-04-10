import test from "node:test";
import assert from "node:assert/strict";
import { buildFinancialKpiEmailRows } from "./alertFinancialKpiEmail.util.js";

test("buildFinancialKpiEmailRows: sales uses USD with 2 decimals", () => {
  const rows = buildFinancialKpiEmailRows("sales", 1000, 950.5);
  assert.equal(rows[0]?.label, "Goal (net sales)");
  assert.match(rows[0]?.value ?? "", /1,?000\.00/);
  assert.equal(rows[1]?.label, "Current (net sales)");
  assert.match(rows[1]?.value ?? "", /950\.50/);
});

test("buildFinancialKpiEmailRows: labor and food use percent with 2 decimals", () => {
  const labor = buildFinancialKpiEmailRows("laborCostPct", 20, 22.25);
  assert.equal(labor[0]?.value, "20.00%");
  assert.equal(labor[1]?.value, "22.25%");
  const food = buildFinancialKpiEmailRows("foodCostPct", 30, 31.1);
  assert.equal(food[1]?.value, "31.10%");
});

test("buildFinancialKpiEmailRows: hours and spmh", () => {
  const hours = buildFinancialKpiEmailRows("hours", 40, 41.25);
  assert.equal(hours[0]?.value, "40.00 hours");
  assert.equal(hours[1]?.value, "41.25 hours");
  const spmh = buildFinancialKpiEmailRows("spmh", 100, 88.88);
  assert.match(spmh[0]?.value ?? "", /\$100\.00\/hr/);
  assert.match(spmh[1]?.value ?? "", /\$88\.88\/hr/);
});
