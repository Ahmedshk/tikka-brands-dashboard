/**
 * Whether Square Money `amount` should be persisted (Mongo cents fields).
 * Uses typeof / finite checks so callers avoid `!= null` / `== null` Sonar noise.
 */
export function squareMoneyAmountIsPresent(amount: unknown): boolean {
  if (typeof amount === "bigint") {
    return Number.isFinite(Number(amount));
  }
  if (typeof amount === "number") {
    return Number.isFinite(amount);
  }
  if (typeof amount === "string") {
    const trimmed = amount.trim();
    return trimmed.length > 0 && Number.isFinite(Number(trimmed));
  }
  return false;
}
