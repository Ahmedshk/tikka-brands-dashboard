import { google } from "googleapis";
import { GoogleBusinessConnectionModel } from "../models/googleBusinessConnection.model.js";
import { encryptCredentials, decryptCredentials } from "../utils/credentialsEncryption.util.js";
import { AppError } from "../utils/errors.util.js";
import { logger } from "../utils/logger.util.js";

const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
const USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";
const GBP_OAUTH_SCOPES = [GBP_SCOPE, USERINFO_EMAIL_SCOPE] as const;
const SINGLETON_KEY = "default";

function toGoogleBusinessOAuthError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const GaxiosError = google.common?.GaxiosError as
    | (new (...args: never[]) => { message: string; response?: { data?: unknown } })
    | undefined;
  if (GaxiosError && err instanceof GaxiosError) {
    const data = err.response?.data;
    const apiMessage =
      typeof data === "object" &&
      data !== null &&
      "error_description" in data &&
      typeof data.error_description === "string"
        ? data.error_description
        : typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "object" &&
            data.error !== null &&
            "message" in data.error &&
            typeof data.error.message === "string"
          ? data.error.message
          : err.message;
    return new AppError(`Google OAuth failed: ${apiMessage}`, 400);
  }

  const message = err instanceof Error ? err.message : "OAuth failed";
  return new AppError(message, 400);
}

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

function getOAuthClientId(): string {
  const id = process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_ID?.trim();
  if (!id) {
    throw new AppError(
      "Google Business Profile OAuth is not configured (GOOGLE_BUSINESS_OAUTH_CLIENT_ID).",
      503,
    );
  }
  return id;
}

function getOAuthClientSecret(): string {
  const secret = process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET?.trim();
  if (!secret) {
    throw new AppError(
      "Google Business Profile OAuth is not configured (GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET).",
      503,
    );
  }
  return secret;
}

export function getGoogleBusinessOAuthRedirectUri(): string {
  const override = process.env.GOOGLE_BUSINESS_OAUTH_REDIRECT_URI?.trim();
  if (override) return override;
  const base = (
    process.env.API_PUBLIC_URL ??
    process.env.APP_URL ??
    `http://localhost:${process.env.PORT ?? "5000"}`
  ).replace(/\/$/, "");
  return `${base}/api/google-business/oauth/callback`;
}

function createOAuth2Client() {
  return new google.auth.OAuth2(
    getOAuthClientId(),
    getOAuthClientSecret(),
    getGoogleBusinessOAuthRedirectUri(),
  );
}

export interface GoogleBusinessConnectionStatus {
  connected: boolean;
  connectedEmail?: string;
  connectedAt?: string;
}

export async function getGoogleBusinessConnectionStatus(): Promise<GoogleBusinessConnectionStatus> {
  const doc = await GoogleBusinessConnectionModel.findOne({ singletonKey: SINGLETON_KEY }).lean();
  if (!doc) {
    return { connected: false };
  }
  return {
    connected: true,
    connectedEmail: doc.connectedEmail,
    connectedAt: doc.connectedAt.toISOString(),
  };
}

export function buildGoogleBusinessOAuthUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GBP_OAUTH_SCOPES],
    state,
  });
}

export async function handleGoogleBusinessOAuthCallback(
  code: string,
): Promise<GoogleBusinessConnectionStatus> {
  try {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new AppError(
        "Google did not return a refresh token. Disconnect and reconnect with consent.",
        400,
      );
    }

    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email?.trim();
    if (!email) {
      throw new AppError("Could not read Google account email after OAuth.", 400);
    }

    const refreshTokenEnc = encryptCredentials(tokens.refresh_token);
    const connectedAt = new Date();

    await GoogleBusinessConnectionModel.findOneAndUpdate(
      { singletonKey: SINGLETON_KEY },
      {
        singletonKey: SINGLETON_KEY,
        refreshTokenEnc,
        connectedEmail: email,
        connectedAt,
      },
      { upsert: true, new: true },
    );

    cachedAccessToken = null;
    logger.info("[GoogleBusiness] OAuth connection saved", { email });

    return {
      connected: true,
      connectedEmail: email,
      connectedAt: connectedAt.toISOString(),
    };
  } catch (err) {
    logger.error("[GoogleBusiness] OAuth callback failed", { err });
    throw toGoogleBusinessOAuthError(err);
  }
}

export async function disconnectGoogleBusiness(): Promise<void> {
  await GoogleBusinessConnectionModel.deleteOne({ singletonKey: SINGLETON_KEY });
  cachedAccessToken = null;
  logger.info("[GoogleBusiness] OAuth connection removed");
}

export async function getGoogleBusinessAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const doc = await GoogleBusinessConnectionModel.findOne({ singletonKey: SINGLETON_KEY }).lean();
  if (!doc?.refreshTokenEnc) {
    throw new AppError("Google Business Profile is not connected.", 503);
  }

  const refreshToken = decryptCredentials(doc.refreshTokenEnc);
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  const accessToken = credentials.access_token;
  if (!accessToken) {
    throw new AppError("Failed to refresh Google Business Profile access token.", 503);
  }

  const expiresAtMs = credentials.expiry_date ?? Date.now() + 3600 * 1000;
  cachedAccessToken = { token: accessToken, expiresAtMs };
  return accessToken;
}

export async function isGoogleBusinessConnected(): Promise<boolean> {
  const doc = await GoogleBusinessConnectionModel.findOne({ singletonKey: SINGLETON_KEY })
    .select("_id")
    .lean();
  return doc != null;
}
