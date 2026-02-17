import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const HEX_KEY_LENGTH = 64;

function getEncryptionKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set. Set it to 64 hex characters (0-9, a-f), e.g. run: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  // Accept 64-char hex
  if (raw.length === HEX_KEY_LENGTH && /^[0-9a-fA-F]+$/.test(raw)) {
    const key = Buffer.from(raw, "hex");
    if (key.length === KEY_LENGTH) return key;
  }

  // Accept base64-encoded 32 bytes (44 chars)
  if (raw.length >= 43 && raw.length <= 44) {
    try {
      const key = Buffer.from(raw, "base64");
      if (key.length === KEY_LENGTH) return key;
    } catch {
      // fall through to error
    }
  }

  throw new Error(
    "CREDENTIALS_ENCRYPTION_KEY must be either (1) exactly 64 hex characters (0-9, a-f), or (2) base64 encoding of 32 bytes. Generate hex with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

/**
 * Encrypt a plaintext credential for storage. Uses AES-256-GCM with a random IV per call.
 * Stored format (base64): iv (12) || authTag (16) || ciphertext.
 */
export function encryptCredentials(plaintext: string): string {
  if (plaintext === "") {
    throw new Error("Cannot encrypt empty string");
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a stored credential. Returns null if input is empty or decryption fails.
 */
export function decryptCredentials(ciphertext: string): string | null {
  if (!ciphertext || ciphertext.trim() === "") {
    return null;
  }
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(ciphertext, "base64");
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      return null;
    }
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    return null;
  }
}
