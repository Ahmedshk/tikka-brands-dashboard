import sgMail from "@sendgrid/mail";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ejs from "ejs";
import { UserModel } from "../models/user.model.js";
import { getMailTransport } from "../config/nodemailer.js";
import { logger } from "../utils/logger.util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

let initialized = false;

function ensureInit(): boolean {
  if (initialized) return true;
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) {
    logger.warn("SendGrid: SENDGRID_API_KEY not set. Email sending disabled.");
    return false;
  }
  sgMail.setApiKey(apiKey);
  initialized = true;
  return true;
}

function getFromAddress(): string {
  const email = process.env.SENDGRID_FROM_EMAIL?.trim() ?? process.env.SMTP_FROM?.trim() ?? "";
  const name = process.env.SENDGRID_FROM_NAME?.trim() ?? "Tikka Brands Dashboard";
  if (!email) return "";
  return name ? `${name} <${email}>` : email;
}

function getBaseUrl(): string {
  const base =
    process.env.CLIENT_URL ?? process.env.APP_URL ?? process.env.FRONTEND_URL ?? "";
  return (typeof base === "string" ? base : "").trim().replace(/\/$/, "");
}

function getLogoUrl(): string {
  const base = getBaseUrl();
  return base ? base + "/main_logo.svg" : "";
}

export interface TransactionalEmailOptions {
  to?: string;
  recipientUserId?: string;
  subject: string;
  html?: string;
  templateFile?: string;
  templateData?: Record<string, unknown>;
}

async function sendViaSmtp(
  toAddress: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const transport = getMailTransport();
  if (!transport) return false;
  const smtpFrom = process.env.SMTP_FROM?.trim();
  if (!smtpFrom) {
    logger.error("Email: SMTP_FROM not set. Cannot use SMTP fallback.");
    return false;
  }
  try {
    await transport.sendMail({ from: smtpFrom, to: toAddress, subject, html });
    logger.info("Email sent via SMTP", { to: toAddress, subject });
    return true;
  } catch (err) {
    logger.error("Email: SMTP send failed", { to: toAddress, err });
    return false;
  }
}

export async function sendTransactionalEmail(
  options: TransactionalEmailOptions,
): Promise<boolean> {
  const from = getFromAddress();
  if (!from) {
    logger.error("Email: No from address configured (SENDGRID_FROM_EMAIL or SMTP_FROM).");
    return false;
  }

  let toAddress = options.to;
  if (!toAddress && options.recipientUserId) {
    const user = await UserModel.findById(options.recipientUserId).select("email").lean();
    if (!user) {
      logger.error("Email: Recipient user not found", { userId: options.recipientUserId });
      return false;
    }
    toAddress = user.email;
  }

  if (!toAddress) {
    logger.error("Email: No recipient address");
    return false;
  }

  let html = options.html ?? "";
  if (options.templateFile) {
    try {
      html = await ejs.renderFile(
        path.join(TEMPLATES_DIR, options.templateFile),
        { logoUrl: getLogoUrl(), baseUrl: getBaseUrl(), ...options.templateData },
      );
    } catch (err) {
      logger.error("Email: EJS template render failed", { template: options.templateFile, err });
      return false;
    }
  }

  const subject = options.subject;

  if (ensureInit()) {
    try {
      await sgMail.send({ to: toAddress, from, subject, html });
      logger.info("Email sent via SendGrid", { to: toAddress, subject });
      return true;
    } catch (err) {
      logger.warn("SendGrid: Failed to send email, trying SMTP fallback", { to: toAddress, err });
    }
  }

  if (await sendViaSmtp(toAddress, subject, html)) return true;

  if (!process.env.SENDGRID_API_KEY?.trim()) {
    logger.warn("Email: SendGrid not configured (SENDGRID_API_KEY) and SMTP not available. No email sent.");
  }
  return false;
}

export async function sendInvitationEmailViaSendGrid(options: {
  to: string;
  firstName: string;
  setPasswordUrl: string;
}): Promise<boolean> {
  return sendTransactionalEmail({
    to: options.to,
    subject: "You're invited to Tikka Brands Dashboard",
    templateFile: "invitation-email.ejs",
    templateData: {
      firstName: options.firstName,
      setPasswordUrl: options.setPasswordUrl,
    },
  });
}
