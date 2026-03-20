import path from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import { getMailTransport } from "../config/nodemailer.js";
import { sendInvitationEmailViaSendGrid } from "./email.service.js";
import { logger } from "../utils/logger.util.js";
import type { SendInvitationEmailOptions } from "../types/mailer.types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

function getBaseUrl(): string {
  const base =
    process.env.CLIENT_URL ??
    process.env.APP_URL ??
    process.env.FRONTEND_URL ??
    "";
  return (typeof base === "string" ? base : "").trim().replace(/\/$/, "");
}

function getLogoUrl(): string {
  const base = getBaseUrl();
  if (!base) return "";
  return base + "/main_logo.svg";
}

/**
 * Send invitation email. Tries SendGrid first, falls back to SMTP/Nodemailer.
 */
export async function sendInvitationEmail(
  options: SendInvitationEmailOptions,
): Promise<boolean> {
  const { to, firstName, setPasswordUrl } = options;

  // Try SendGrid first
  if (process.env.SENDGRID_API_KEY?.trim()) {
    const sent = await sendInvitationEmailViaSendGrid({ to, firstName, setPasswordUrl });
    if (sent) return true;
    logger.warn("SendGrid invitation failed, falling back to SMTP");
  }

  // Fallback to SMTP/Nodemailer
  const transport = getMailTransport();
  if (!transport) return false;

  try {
    const logoUrl = getLogoUrl();
    const html = await ejs.renderFile(
      path.join(TEMPLATES_DIR, "invitation-email.ejs"),
      { firstName, setPasswordUrl, logoUrl },
    );

    const from = process.env.SMTP_FROM?.trim();
    if (!from) {
      logger.error("SMTP_FROM is not set. Skipping email send.");
      return false;
    }
    await transport.sendMail({
      from,
      to,
      subject: "You're invited to Tikka Brands Dashboard",
      html,
    });
    logger.info("Invitation email sent via SMTP", { to });
    return true;
  } catch (err) {
    logger.error("Failed to send invitation email", { to, err });
    return false;
  }
}
