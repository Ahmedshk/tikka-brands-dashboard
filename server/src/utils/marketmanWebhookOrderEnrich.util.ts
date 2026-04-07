import { getMarketManCatalogItems } from "../services/marketman.service.js";
import type { MarketManCatalogItem } from "../services/marketman.service.js";
import { logger } from "./logger.util.js";
import { fillMissingOrderStatusFieldsFromOrderStatus } from "./marketmanWebhookOrderStatus.util.js";

function isMissingField(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  if (typeof v === "number" && Number.isNaN(v)) return true;
  return false;
}

export function normalizeMarketManProductCodeForMatch(s: unknown): string {
  if (s == null) return "";
  if (typeof s === "string") return s.trim();
  if (typeof s === "number" && Number.isFinite(s)) return String(s);
  if (typeof s === "bigint") return String(s);
  return "";
}

function linePriceTotalWithVatRaw(line: Record<string, unknown>): unknown {
  return line.PriceTotalWithVat ?? line.PriceTotalWithVAT;
}

export function lineNeedsCatalogEnrichmentFields(line: Record<string, unknown>): boolean {
  return (
    isMissingField(line.ItemMeasureTypeID) ||
    isMissingField(line.ItemMeasureTypeName) ||
    isMissingField(line.PackQuantity) ||
    isMissingField(line.PacksPerCase) ||
    isMissingField(line.TaxLevelID) ||
    isMissingField(line.TaxValue)
  );
}

/** When PTV is missing we must resolve TaxLevelID + TaxValue before computing. */
export function lineNeedsCatalogForPriceTotalWithVat(line: Record<string, unknown>): boolean {
  if (!isMissingField(linePriceTotalWithVatRaw(line))) return false;
  return isMissingField(line.TaxLevelID) || isMissingField(line.TaxValue);
}

export function lineNeedsGetCatalogItems(line: Record<string, unknown>): boolean {
  return (
    lineNeedsCatalogEnrichmentFields(line) || lineNeedsCatalogForPriceTotalWithVat(line)
  );
}

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "bigint") return Number(v);
  return null;
}

export function normalizeWebhookLineCatalogIds(line: Record<string, unknown>): void {
  if (line.CatalogItemID == null && line.ItemID != null) {
    line.CatalogItemID = line.ItemID;
  }
  if (line.CatalogItemCode == null && line.ItemCode != null) {
    line.CatalogItemCode = line.ItemCode;
  }
}

export function buildCatalogByProductCode(
  items: MarketManCatalogItem[],
): Map<string, MarketManCatalogItem> {
  const map = new Map<string, MarketManCatalogItem>();
  for (const row of items) {
    const key = normalizeMarketManProductCodeForMatch(row.ProductCode);
    if (key) map.set(key, row);
  }
  return map;
}

export function mergeCatalogRowIntoLineItem(
  line: Record<string, unknown>,
  cat: MarketManCatalogItem,
): void {
  if (isMissingField(line.PackQuantity) && cat.PackQty != null) {
    line.PackQuantity = cat.PackQty;
  }
  if (isMissingField(line.PacksPerCase) && cat.PacksPerCase != null) {
    line.PacksPerCase = cat.PacksPerCase;
  }
  if (isMissingField(line.ItemMeasureTypeID) && cat.UOMID != null) {
    line.ItemMeasureTypeID = cat.UOMID;
  }
  if (isMissingField(line.ItemMeasureTypeName) && cat.UOMName != null) {
    line.ItemMeasureTypeName = cat.UOMName;
  }
  if (isMissingField(line.TaxLevelID) && cat.TaxLevelID != null) {
    line.TaxLevelID = cat.TaxLevelID;
  }
  if (isMissingField(line.TaxValue) && cat.TaxValue != null) {
    line.TaxValue = cat.TaxValue;
  }
}

export function applyPriceTotalWithVatIfMissing(line: Record<string, unknown>): void {
  if (!isMissingField(linePriceTotalWithVatRaw(line))) return;
  const priceTotal = toFiniteNumber(line.PriceTotal);
  const taxValue = toFiniteNumber(line.TaxValue);
  const qty = toFiniteNumber(line.Quantity);
  if (priceTotal === null || taxValue === null || qty === null) return;
  const computed = priceTotal + taxValue * qty;
  line.PriceTotalWithVat = computed;
}

/**
 * Deep-clones the order, normalizes line catalog ids, optionally fetches GetCatalogItems,
 * merges missing pack/UOM/tax fields, then derives line PriceTotalWithVat when missing.
 */
export async function enrichMarketManWebhookOrder(
  order: Record<string, unknown>,
  buyerGuid: string,
): Promise<{ order: Record<string, unknown>; enrichmentPartial: boolean }> {
  const cloned = structuredClone(order) as Record<string, unknown>;
  fillMissingOrderStatusFieldsFromOrderStatus(cloned);

  const itemsUnknown = cloned.Items;
  if (!Array.isArray(itemsUnknown) || itemsUnknown.length === 0) {
    return { order: cloned, enrichmentPartial: false };
  }

  const items = itemsUnknown as unknown[];
  for (const raw of items) {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
      normalizeWebhookLineCatalogIds(raw as Record<string, unknown>);
    }
  }

  const needsCatalog = items.some(
    (it) =>
      it != null &&
      typeof it === "object" &&
      !Array.isArray(it) &&
      lineNeedsGetCatalogItems(it as Record<string, unknown>),
  );

  let enrichmentPartial = false;
  const vendorGuid =
    typeof cloned.VendorGuid === "string" ? cloned.VendorGuid.trim() : "";

  if (needsCatalog) {
    if (!vendorGuid) {
      enrichmentPartial = true;
      logger.warn("marketman webhook enrich: VendorGuid missing; cannot call GetCatalogItems", {
        buyerGuid,
        orderNumber: cloned.OrderNumber,
      });
    } else {
      try {
        const catalog = await getMarketManCatalogItems(buyerGuid, vendorGuid);
        const bySku = buildCatalogByProductCode(catalog);
        for (const raw of items) {
          if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
          const line = raw as Record<string, unknown>;
          if (!lineNeedsGetCatalogItems(line)) continue;
          const sku = normalizeMarketManProductCodeForMatch(line.SKU);
          if (!sku) {
            enrichmentPartial = true;
            continue;
          }
          const cat = bySku.get(sku);
          if (!cat) {
            enrichmentPartial = true;
            continue;
          }
          mergeCatalogRowIntoLineItem(line, cat);
        }
      } catch (err) {
        enrichmentPartial = true;
        logger.error("marketman webhook enrich: GetCatalogItems failed", {
          buyerGuid,
          vendorGuid,
          orderNumber: cloned.OrderNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  for (const raw of items) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
    applyPriceTotalWithVatIfMissing(raw as Record<string, unknown>);
  }

  return { order: cloned, enrichmentPartial };
}
