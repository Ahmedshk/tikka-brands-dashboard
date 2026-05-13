import type { Request } from "express";
import { AppError } from "./errors.util.js";

export function routeParamId(req: Request, name: string): string {
  const raw = req.params[name as keyof typeof req.params];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string" || !id) throw new AppError(`Missing ${name}`, 400);
  return id;
}

