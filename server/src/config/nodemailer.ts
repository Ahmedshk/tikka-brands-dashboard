import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../utils/logger.util.js";

let cachedTransport: Transporter | null = null;

function isConfigured(): boolean {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(host && user && pass);
}

/**
 * Create and cache a Nodemailer transport from env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE).
 * Returns null if SMTP is not fully configured.
 */
export function getMailTransport(): Transporter | null {
  if (!isConfigured()) {
    logger.warn(
      "Mailer: SMTP not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS). Skipping send.",
    );
    return null;
  }

  if (cachedTransport) return cachedTransport;

  const host = process.env.SMTP_HOST!.trim();
  const port = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();
  const secure =
    process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1";

  let portNumber: number;
  if (port) {
    portNumber = Number.parseInt(port, 10);
  } else {
    portNumber = secure ? 465 : 587;
  }

  cachedTransport = nodemailer.createTransport({
    host,
    port: portNumber,
    secure,
    auth: { user, pass },
  });

  return cachedTransport;
}

export function isMailConfigured(): boolean {
  return isConfigured();
}

/**
 * Optional: call at app startup to validate SMTP config and cache the transport.
 * If not called, the transport is created lazily on first send.
 */
export const initializeNodemailer = (): void => {
  if (isConfigured()) {
    getMailTransport();
    logger.info("Nodemailer initialized (SMTP configured)");
  }
};
