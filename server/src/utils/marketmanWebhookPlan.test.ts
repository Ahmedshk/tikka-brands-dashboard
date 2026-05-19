import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractMarketManWebhookPayload } from "./marketmanWebhookExtract.util.js";
import {
  lineNeedsGetCatalogItems,
  normalizeMarketManProductCodeForMatch,
  mergeCatalogRowIntoLineItem,
  applyPriceTotalWithVatIfMissing,
  buildCatalogByProductCode,
} from "./marketmanWebhookOrderEnrich.util.js";
import type { MarketManCatalogItem } from "../services/marketman.service.js";
import { fillMissingOrderStatusFieldsFromOrderStatus } from "./marketmanWebhookOrderStatus.util.js";
import {
  inferMarketManOrderApiKindFromOrderRaw,
  normalizeMarketManWebhookOrderDates,
  pickMarketManOrderDateString,
} from "./marketmanWebhookOrderDates.util.js";
import { marketManOrderWebhookSyncWindowUtc } from "./marketmanOrderWebhookSyncWindow.util.js";

describe("extractMarketManWebhookPayload", () => {
  it("extracts HoodEventID + Data as order", () => {
    const body = {
      HoodEventID: "615494",
      Data: {
        OrderNumber: "31614569",
        BuyerGuid: "15a113bbabf04d5b8ddb2b14299603f3",
        VendorGuid: "adfef1abade94145b09ab396c2d323f3",
        Items: [],
      },
    };
    const r = extractMarketManWebhookPayload(body);
    assert.equal(r.order?.OrderNumber, "31614569");
    assert.equal(r.eventName, "HoodEvent:615494");
    assert.equal(r.buyerGuid, "15a113bbabf04d5b8ddb2b14299603f3");
  });

  it("unwraps Event envelope with HoodEventID + Data", () => {
    const body = {
      IsSuccess: true,
      Event: {
        HoodEventID: "1",
        Data: {
          OrderNumber: "99",
          BuyerGuid: "buyer-guid",
          VendorGuid: "vendor-guid",
        },
      },
    };
    const r = extractMarketManWebhookPayload(body);
    assert.equal(r.order?.OrderNumber, "99");
    assert.equal(r.buyerGuid, "buyer-guid");
    assert.equal(r.eventName, "HoodEvent:1");
  });

  it("legacy top-level Order still works", () => {
    const body = {
      Order: {
        OrderNumber: "7",
        BuyerGuid: "bg",
        DeliveryDateUTC: "2026/04/07 16:00:00",
      },
    };
    const r = extractMarketManWebhookPayload(body);
    assert.equal(r.order?.OrderNumber, "7");
    assert.equal(r.buyerGuid, "bg");
  });
});

describe("marketmanWebhookOrderDates", () => {
  it("normalizes Hood DeliveryDate / SentDate onto UTC keys", () => {
    const order: Record<string, unknown> = {
      DeliveryDate: "2026/05/23 10:00:00",
      SentDate: "2026/05/18 08:36:06",
    };
    normalizeMarketManWebhookOrderDates(order);
    assert.equal(order.DeliveryDateUTC, "2026/05/23 10:00:00");
    assert.equal(order.SentDateUTC, "2026/05/18 08:36:06");
  });

  it("does not overwrite existing DeliveryDateUTC / SentDateUTC", () => {
    const order: Record<string, unknown> = {
      DeliveryDateUTC: "2026/04/01 12:00:00",
      DeliveryDate: "2026/05/23 10:00:00",
    };
    normalizeMarketManWebhookOrderDates(order);
    assert.equal(order.DeliveryDateUTC, "2026/04/01 12:00:00");
  });

  it("infers delivery when Hood delivery date is present", () => {
    assert.equal(
      inferMarketManOrderApiKindFromOrderRaw({
        DeliveryDate: "2026/05/23 10:00:00",
        SentDate: "2026/05/18 08:36:06",
      }),
      "delivery",
    );
  });

  it("infers sent when only SentDate is present", () => {
    assert.equal(
      inferMarketManOrderApiKindFromOrderRaw({
        SentDate: "2026/05/18 08:36:06",
      }),
      "sent",
    );
  });

  it("derives sync window from Hood DeliveryDate for delivery apiKind", () => {
    const order: Record<string, unknown> = {
      DeliveryDate: "2026/05/23 10:00:00",
    };
    const window = marketManOrderWebhookSyncWindowUtc(order, "delivery");
    assert.ok(window);
    assert.match(window!.dateTimeFromUTC, /^2026\/05\/23 00:00:00$/);
    assert.match(window!.dateTimeToUTC, /^2026\/05\/23 23:59:59$/);
    assert.equal(pickMarketManOrderDateString(order, "delivery"), "2026/05/23 10:00:00");
  });
});

describe("fillMissingOrderStatusFieldsFromOrderStatus", () => {
  const cases: {
    orderStatus: string;
    id: number;
    uiName: string;
  }[] = [
    { orderStatus: "Sent", id: 5, uiName: "Sent" },
    {
      orderStatus: "Confirmed by vendor",
      id: 2,
      uiName: "Confirmed by supplier",
    },
    {
      orderStatus: "Cancelled by buyer",
      id: 3,
      uiName: "Cancelled by buyer",
    },
    {
      orderStatus: "Submission Rejected",
      id: 14,
      uiName: "Submission Rejected",
    },
    { orderStatus: "Vendor handling", id: 6, uiName: "Received" },
    {
      orderStatus: "Cancelled by vendor",
      id: 4,
      uiName: "Cancelled by supplier",
    },
  ];

  for (const { orderStatus, id, uiName } of cases) {
    it(`maps "${orderStatus}" to id ${id} and UI name`, () => {
      const order: Record<string, unknown> = { OrderStatus: orderStatus };
      fillMissingOrderStatusFieldsFromOrderStatus(order);
      assert.equal(order.OrderStatusID, id);
      assert.equal(order.OrderStatusUIName, uiName);
    });
  }

  it("trims OrderStatus before match", () => {
    const order: Record<string, unknown> = { OrderStatus: "  Sent  " };
    fillMissingOrderStatusFieldsFromOrderStatus(order);
    assert.equal(order.OrderStatusID, 5);
    assert.equal(order.OrderStatusUIName, "Sent");
  });

  it("leaves missing fields when OrderStatus is unknown", () => {
    const order: Record<string, unknown> = { OrderStatus: "Unknown status" };
    fillMissingOrderStatusFieldsFromOrderStatus(order);
    assert.equal(order.OrderStatusID, undefined);
    assert.equal(order.OrderStatusUIName, undefined);
  });

  it("does not overwrite existing OrderStatusID", () => {
    const order: Record<string, unknown> = {
      OrderStatus: "Sent",
      OrderStatusID: 99,
    };
    fillMissingOrderStatusFieldsFromOrderStatus(order);
    assert.equal(order.OrderStatusID, 99);
    assert.equal(order.OrderStatusUIName, "Sent");
  });

  it("does not overwrite existing OrderStatusUIName", () => {
    const order: Record<string, unknown> = {
      OrderStatus: "Sent",
      OrderStatusUIName: "Custom",
    };
    fillMissingOrderStatusFieldsFromOrderStatus(order);
    assert.equal(order.OrderStatusID, 5);
    assert.equal(order.OrderStatusUIName, "Custom");
  });
});

describe("marketmanWebhookOrderEnrich helpers", () => {
  it("normalizeMarketManProductCodeForMatch trims and stringifies numbers", () => {
    assert.equal(normalizeMarketManProductCodeForMatch("  2032935 "), "2032935");
    assert.equal(normalizeMarketManProductCodeForMatch(2032935), "2032935");
    assert.equal(normalizeMarketManProductCodeForMatch(null), "");
  });

  it("lineNeedsGetCatalogItems when enrichable fields missing", () => {
    assert.equal(
      lineNeedsGetCatalogItems({
        SKU: "1",
        Quantity: 1,
        PackQuantity: 1,
        PacksPerCase: 1,
        ItemMeasureTypeID: 1,
        ItemMeasureTypeName: "lb",
        TaxLevelID: 1,
        TaxValue: 0,
        PriceTotalWithVat: 10,
      }),
      false,
    );
    assert.equal(
      lineNeedsGetCatalogItems({
        SKU: "1",
        Quantity: 1,
        PackQuantity: 1,
        PacksPerCase: 1,
        ItemMeasureTypeID: 1,
        ItemMeasureTypeName: "lb",
        TaxLevelID: 1,
        TaxValue: 0,
        PriceTotal: 10,
      }),
      false,
    );
    assert.equal(
      lineNeedsGetCatalogItems({
        SKU: "1",
        Quantity: 1,
        PackQuantity: 1,
        PacksPerCase: 1,
        ItemMeasureTypeID: 1,
        ItemMeasureTypeName: "lb",
        TaxLevelID: 1,
        PriceTotal: 10,
      }),
      true,
    );
    assert.equal(
      lineNeedsGetCatalogItems({
        SKU: "1",
        Quantity: 1,
        PriceTotal: 100,
        TaxLevelID: 1,
        TaxValue: 0.5,
      }),
      true,
    );
    assert.equal(
      lineNeedsGetCatalogItems({
        SKU: "1",
        Quantity: 1,
        PackQuantity: 1,
        PacksPerCase: 1,
        ItemMeasureTypeID: 1,
        ItemMeasureTypeName: "lb",
        TaxLevelID: 1,
        TaxValue: 0.5,
        PriceTotal: 100,
      }),
      false,
    );
  });

  it("mergeCatalogRowIntoLineItem fills only missing fields", () => {
    const line: Record<string, unknown> = {
      SKU: "2032935",
      PackQuantity: 99,
      TaxValue: null,
    };
    const cat: MarketManCatalogItem = {
      ProductCode: "2032935",
      PackQty: 5,
      PacksPerCase: 6,
      UOMID: 32,
      UOMName: "lb",
      TaxLevelID: 1,
      TaxValue: 0,
    };
    mergeCatalogRowIntoLineItem(line, cat);
    assert.equal(line.PackQuantity, 99);
    assert.equal(line.PacksPerCase, 6);
    assert.equal(line.ItemMeasureTypeID, 32);
    assert.equal(line.TaxValue, 0);
  });

  it("applyPriceTotalWithVatIfMissing uses PriceTotal + TaxValue * Quantity", () => {
    const line: Record<string, unknown> = {
      PriceTotal: 87.34,
      TaxValue: 0,
      Quantity: 2,
    };
    applyPriceTotalWithVatIfMissing(line);
    assert.equal(line.PriceTotalWithVat, 87.34);
    const line2: Record<string, unknown> = {
      PriceTotal: 100,
      TaxValue: 0.5,
      Quantity: 2,
    };
    applyPriceTotalWithVatIfMissing(line2);
    assert.equal(line2.PriceTotalWithVat, 101);
  });

  it("buildCatalogByProductCode indexes by ProductCode", () => {
    const rows: MarketManCatalogItem[] = [
      { ProductCode: "A", PackQty: 1 },
      { ProductCode: "B", PackQty: 2 },
    ];
    const m = buildCatalogByProductCode(rows);
    assert.equal(m.get("A")?.PackQty, 1);
  });
});
