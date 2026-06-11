import type { Request, Response } from "express";
import crypto from "node:crypto";
import {
  buildGoogleBusinessOAuthUrl,
  disconnectGoogleBusiness,
  getGoogleBusinessConnectionStatus,
  handleGoogleBusinessOAuthCallback,
} from "../services/googleBusinessConnection.service.js";
import { AppError } from "../utils/errors.util.js";

const OAUTH_STATE_COOKIE = "gbp_oauth_state";

function clientRedirectBase(): string {
  return (
    process.env.CLIENT_URL ??
    process.env.APP_URL ??
    process.env.FRONTEND_URL ??
    "http://localhost:5173"
  ).replace(/\/$/, "");
}

export async function getGoogleBusinessConnection(_req: Request, res: Response): Promise<void> {
  const status = await getGoogleBusinessConnectionStatus();
  res.json(status);
}

export async function startGoogleBusinessOAuth(_req: Request, res: Response): Promise<void> {
  const state = crypto.randomBytes(24).toString("hex");
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });
  const url = buildGoogleBusinessOAuthUrl(state);
  res.json({ url });
}

export async function googleBusinessOAuthCallback(req: Request, res: Response): Promise<void> {
  const redirectBase = `${clientRedirectBase()}/dashboard/data-sync-settings`;
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];

  res.clearCookie(OAUTH_STATE_COOKIE);

  if (!code || !state || !cookieState || state !== cookieState) {
    res.redirect(`${redirectBase}?gbp=error&message=invalid_oauth_state`);
    return;
  }

  try {
    await handleGoogleBusinessOAuthCallback(code);
    res.redirect(`${redirectBase}?gbp=connected`);
  } catch (err) {
    const message =
      err instanceof AppError ? err.message : err instanceof Error ? err.message : "OAuth failed";
    res.redirect(`${redirectBase}?gbp=error&message=${encodeURIComponent(message)}`);
  }
}

export async function deleteGoogleBusinessConnection(
  _req: Request,
  res: Response,
): Promise<void> {
  await disconnectGoogleBusiness();
  res.status(204).send();
}
