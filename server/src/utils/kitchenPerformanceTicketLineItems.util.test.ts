import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildItemSalesModifierLookup,
  buildKitchenPerformanceTicketLineItem,
  kitchenPerformanceVariationOption,
  resolveKitchenPerformanceTicketLineOptions,
} from "./kitchenPerformanceTicketLineItems.util.js";

describe("kitchenPerformanceVariationOption", () => {
  it("hides default variation labels", () => {
    assert.equal(kitchenPerformanceVariationOption("Regular"), null);
    assert.equal(kitchenPerformanceVariationOption("3 Tenders"), "3 Tenders");
  });
});

describe("buildItemSalesModifierLookup", () => {
  it("groups modifiers by order and item", () => {
    const lookup = buildItemSalesModifierLookup([
      {
        "ItemSales.order_id": "order-1",
        "ItemSales.item_name": "California Burrito",
        "ItemSales.item_variation_name": "Regular",
        "ItemSales.modifier_name": "Medium",
      },
      {
        "ItemSales.order_id": "order-1",
        "ItemSales.item_name": "California Burrito",
        "ItemSales.item_variation_name": "Regular",
        "ItemSales.modifier_name": "No Drink",
      },
      {
        "ItemSales.order_id": "order-1",
        "ItemSales.item_name": "Tractor Beverage",
        "ItemSales.item_variation_name": "Regular",
        "ItemSales.modifier_name": "Mango Coconut",
      },
    ]);

    assert.deepEqual(
      resolveKitchenPerformanceTicketLineOptions(
        "California Burrito",
        "Regular",
        "order-1",
        lookup,
      ),
      ["Medium", "No Drink"],
    );
    assert.deepEqual(
      resolveKitchenPerformanceTicketLineOptions(
        "Tractor Beverage",
        "Regular",
        "order-1",
        lookup,
      ),
      ["Mango Coconut"],
    );
  });
});

describe("buildKitchenPerformanceTicketLineItem", () => {
  it("keeps item name separate from modifier options", () => {
    const lookup = buildItemSalesModifierLookup([
      {
        "ItemSales.order_id": "order-1",
        "ItemSales.item_name": "Tractor Beverage",
        "ItemSales.item_variation_name": "Regular",
        "ItemSales.modifier_name": "Mango Coconut",
      },
    ]);

    const lineItem = buildKitchenPerformanceTicketLineItem(
      "Tractor Beverage",
      "Regular",
      1,
      "order-1",
      lookup,
    );

    assert.equal(lineItem.itemName, "Tractor Beverage");
    assert.equal(lineItem.quantity, 1);
    assert.deepEqual(lineItem.options, ["Mango Coconut"]);
  });
});
