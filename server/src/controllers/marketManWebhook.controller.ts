import type { NextFunction, Request, Response } from "express";
import { processMarketManWebhookHttp } from "../services/marketmanWebhook.service.js";
import { logger } from "../utils/logger.util.js";

export async function postMarketManWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await processMarketManWebhookHttp(req, res);
  } catch (err) {
    logger.error("postMarketManWebhook failed", { err });
    next(err);
  }
}
