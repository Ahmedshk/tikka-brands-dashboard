import { Router } from "express";
import {
  handleAdobeSignWebhook,
  handleAdobeSignWebhookVerification,
} from "../controllers/adobeSignWebhook.controller.js";

const router = Router();

router.get("/adobe-sign", handleAdobeSignWebhookVerification);
router.post("/adobe-sign", handleAdobeSignWebhook);

export default router;
