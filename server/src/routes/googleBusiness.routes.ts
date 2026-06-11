import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { attachUserContext } from "../middleware/user-context.middleware.js";
import { requirePermission } from "../middleware/rbac.middleware.js";
import {
  deleteGoogleBusinessConnection,
  getGoogleBusinessConnection,
  googleBusinessOAuthCallback,
  startGoogleBusinessOAuth,
} from "../controllers/googleBusiness.controller.js";

const router = Router();

router.get("/oauth/callback", googleBusinessOAuthCallback);

router.use(authenticate, attachUserContext);
router.use(requirePermission("data-sync-settings"));

router.get("/connection", getGoogleBusinessConnection);
router.get("/oauth/start", startGoogleBusinessOAuth);
router.delete("/connection", deleteGoogleBusinessConnection);

export default router;
