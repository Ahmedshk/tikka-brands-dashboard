import type { Request, Response } from "express";
import { LocationRepository } from "../repositories/location.repository.js";
import { LocationService } from "../services/location.service.js";
import { runSquareWebhookHandler } from "../utils/squareWebhookControllerHelpers.util.js";

const locationRepository = new LocationRepository();
const locationService = new LocationService();

export async function handleSquareWebhook(req: Request, res: Response): Promise<void> {
  await runSquareWebhookHandler({ req, res, locationService, locationRepository });
}
