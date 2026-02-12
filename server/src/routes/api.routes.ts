import { Router } from "express";
import authRoutes from "./auth.routes.js";
import locationRoutes from "./location.routes.js";
import goalRoutes from "./goal.routes.js";
import commandCenterRoutes from "./commandCenter.routes.js";
import { healthCheck } from "../controllers/health.controller.js";

const router = Router();

// Health check (no auth required)
router.get("/health", healthCheck);

// Auth routes
router.use("/auth", authRoutes);

// Location management (auth + role required)
router.use("/locations", locationRoutes);

// Goal setting (auth + role required)
router.use("/goals", goalRoutes);

// Command Center KPIs (auth + role required)
router.use("/command-center", commandCenterRoutes);

export default router;
