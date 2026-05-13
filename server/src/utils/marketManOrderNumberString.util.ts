import { squareRawIdAsString } from "./squareRawIdString.util.js";

/** MarketMan `OrderNumber` from API/cache JSON without `String(object)` → `[object Object]`. */
export function marketManOrderNumberAsString(orderNumberRaw: unknown): string {
  return squareRawIdAsString(orderNumberRaw, "");
}
