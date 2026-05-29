import type { NextFunction, Request, Response } from "express";
import { processMarketManWebhookHttp } from "../services/marketmanWebhook.service.js";
import { logWebhookError } from "../utils/webhookLog.util.js";

export async function postMarketManWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await processMarketManWebhookHttp(req, res);
  } catch (err) {
    logWebhookError("MarketMan", "handler failed", { err }, req.body);
    next(err);
  }
}
