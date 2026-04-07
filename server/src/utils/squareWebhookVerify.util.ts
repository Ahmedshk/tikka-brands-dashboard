import crypto from "node:crypto";

/**
 * Verify Square webhook signature (notification URL + raw body).
 * @see https://developer.squareup.com/docs/webhooks/step3validate
 */
export function verifySquareWebhookSignature(
  signatureKey: string,
  notificationUrl: string,
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.trim()) return false;
  const payload = notificationUrl + rawBody;
  const hmac = crypto.createHmac("sha256", signatureKey);
  hmac.update(payload);
  const expected = hmac.digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return expected === signatureHeader;
  }
}

/**
 * Try each signature key until one verifies (multi-location Square apps, one webhook endpoint).
 */
export function verifySquareWebhookSignatureWithAnyKey(
  signatureKeys: readonly string[],
  notificationUrl: string,
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  for (const key of signatureKeys) {
    const k = key.trim();
    if (!k) continue;
    if (verifySquareWebhookSignature(k, notificationUrl, rawBody, signatureHeader)) {
      return true;
    }
  }
  return false;
}
