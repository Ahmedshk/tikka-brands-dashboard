import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidRoleBindingSubcategory,
  roleBindingMatchesSubcategory,
} from "./alertRoleBindingSubcategory.util.js";

test("roleBindingMatchesSubcategory: missing subcategory matches any alert subcategory", () => {
  assert.equal(roleBindingMatchesSubcategory({}, "sales"), true);
  assert.equal(roleBindingMatchesSubcategory({ subcategory: undefined }, "delivery_overdue"), true);
});

test("roleBindingMatchesSubcategory: explicit subcategory matches only that key", () => {
  assert.equal(roleBindingMatchesSubcategory({ subcategory: "sales" }, "sales"), true);
  assert.equal(roleBindingMatchesSubcategory({ subcategory: "sales" }, "spmh"), false);
});

test("isValidRoleBindingSubcategory", () => {
  assert.equal(isValidRoleBindingSubcategory("financial_labor", undefined), true);
  assert.equal(isValidRoleBindingSubcategory("financial_labor", "sales"), true);
  assert.equal(isValidRoleBindingSubcategory("financial_labor", "nope"), false);
  assert.equal(isValidRoleBindingSubcategory("reputation_hr", "pending_pips"), true);
});
