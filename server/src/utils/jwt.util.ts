import jwt from "jsonwebtoken";
import type { TokenPayload } from "../types/auth.types.js";

/** Trim secrets so .env whitespace (e.g. trailing newline/carriage return) never causes signature mismatch */
function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET?.trim();
  if (!secret) throw new Error("JWT_ACCESS_SECRET is not defined");
  return secret;
}

function getRefreshSecret(): string {
  const secret = process.env.JWT_REFRESH_SECRET?.trim();
  if (!secret) throw new Error("JWT_REFRESH_SECRET is not defined");
  return secret;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
  return jwt.sign(payload, getAccessSecret(), { expiresIn } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
  return jwt.sign(payload, getRefreshSecret(), { expiresIn } as jwt.SignOptions);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, getAccessSecret()) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, getRefreshSecret()) as TokenPayload;
};
