import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import ejs from "ejs";
import { logger } from "../utils/logger.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

export interface SendInvitationEmailOptions {
  to: string;
  firstName: string;
  setPasswordUrl: string;
}

function getBaseUrl(): string {
  const base = process.env.CLIENT_URL ?? process.env.APP_URL ?? process.env.FRONTEND_URL ?? "";
  return (typeof base === "string" ? base : "").trim().replace(/\/$/, "");
}

function getLogoUrl(): string {
  const base = getBaseUrl();
  if (!base) return "";
  return base + "/main_logo.svg";
}

function createTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const secure =
    process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1";

  if (!host || !user || !pass) {
    logger.warn(
      "Mailer: SMTP not fully configured (SMTP_HOST, SMTP_USER, SMTP_PASS). Skipping send.",
    );
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: port ? parseInt(port, 10) : secure ? 465 : 587,
    secure,
    auth: { user, pass },
  });
}

export async function sendInvitationEmail(
  options: SendInvitationEmailOptions,
): Promise<boolean> {
  const { to, firstName, setPasswordUrl } = options;

  const transport = createTransport();
  if (!transport) return false;

  try {
    const logoUrl = getLogoUrl();
    const html = await ejs.renderFile(
      path.join(TEMPLATES_DIR, "invitation-email.ejs"),
      {
        firstName,
        setPasswordUrl,
        logoUrl,
      },
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
    logger.info("Invitation email sent", { to });
    return true;
  } catch (err) {
    logger.error("Failed to send invitation email", { to, err });
    return false;
  }
}
