import { Router } from "express";
import { handleSquareWebhook } from "../controllers/squareWebhook.controller.js";

const router = Router();

router.post("/", (req, res, next) => {
  void handleSquareWebhook(req, res).catch(next);
});

export default router;
