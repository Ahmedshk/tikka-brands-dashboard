import twilio from "twilio";
import { UserModel } from "../models/user.model.js";
import { logger } from "../utils/logger.util.js";

let client: ReturnType<typeof twilio> | null = null;

function getClient(): ReturnType<typeof twilio> | null {
  if (client) return client;
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    logger.warn("Twilio: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set. SMS disabled.");
    return null;
  }
  client = twilio(sid, token);
  return client;
}

function getFromNumber(): string {
  return process.env.TWILIO_FROM_NUMBER?.trim() ?? "";
}

/**
 * Normalize a phone number to E.164 format.
 * Handles common US patterns: 10-digit, +1-prefixed, (xxx) xxx-xxxx, etc.
 */
export function normalizePhoneNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export async function sendSMS(options: {
  to: string;
  body: string;
}): Promise<boolean> {
  const tw = getClient();
  if (!tw) return false;

  const from = getFromNumber();
  if (!from) {
    logger.error("Twilio: TWILIO_FROM_NUMBER not set");
    return false;
  }

  const normalized = normalizePhoneNumber(options.to);
  if (!normalized) {
    logger.error("Twilio: Invalid phone number", { phone: options.to });
    return false;
  }

  try {
    await tw.messages.create({
      body: options.body,
      from,
      to: normalized,
    });
    logger.info("SMS sent via Twilio", { to: normalized });
    return true;
  } catch (err) {
    logger.error("Twilio: Failed to send SMS", { to: normalized, err });
    return false;
  }
}

/**
 * Look up user's phone number and send an SMS.
 * Silently skips if user has no phone number.
 */
export async function sendSMSToUser(
  userId: string,
  body: string,
): Promise<boolean> {
  const user = await UserModel.findById(userId).select("phone").lean();
  if (!user?.phone) {
    logger.info("SMS skipped: no phone number", { userId });
    return false;
  }
  return sendSMS({ to: user.phone, body });
}
