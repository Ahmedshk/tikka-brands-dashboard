import { Router } from "express";
import authRoutes from "./auth.routes.js";
import locationRoutes from "./location.routes.js";
import logoRoutes from "./logo.routes.js";
import goalRoutes from "./goal.routes.js";
import commandCenterRoutes from "./commandCenter.routes.js";
import salesLaborRoutes from "./salesLabor.routes.js";
import inventoryRoutes from "./inventory.routes.js";
import roleRoutes from "./role.routes.js";
import userRoutes from "./user.routes.js";
import { healthCheck } from "../controllers/health.controller.js";
import { proxyProfileImage } from "../controllers/proxy.controller.js";

const router = Router();

// Health check (no auth required)
router.get("/health", healthCheck);

// Proxy image (no auth so img src works)
router.get("/proxy/image/:userId", proxyProfileImage);

// Auth routes
router.use("/auth", authRoutes);

// Roles (auth + permission required)
router.use("/roles", roleRoutes);

// Users (auth + user-management permission required)
router.use("/users", userRoutes);

// Location management (auth + role required)
router.use("/locations", locationRoutes);

// Logos (auth + role required)
router.use("/logos", logoRoutes);

// Goal setting (auth + role required)
router.use("/goals", goalRoutes);

// Command Center KPIs (auth + role required)
router.use("/command-center", commandCenterRoutes);

// Sales & Labor Detail (auth + role required)
router.use("/sales-labor", salesLaborRoutes);

// Inventory & Food Cost KPIs (auth + role required)
router.use("/inventory", inventoryRoutes);

export default router;
