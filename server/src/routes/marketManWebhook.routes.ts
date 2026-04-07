import { Router } from "express";
import { postMarketManWebhook } from "../controllers/marketManWebhook.controller.js";

const router = Router();

/** POST /api/webhooks/marketman — MarketMan server → order cache upsert (see marketmanWebhook.service.ts). */
router.post("/marketman", postMarketManWebhook);

export default router;
