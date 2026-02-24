import dotenv from "dotenv";
import { connectDatabase } from "../config/database.js";
import { RoleService } from "../services/role.service.js";
import { logger } from "../utils/logger.util.js";

dotenv.config();

const seedRoles = async () => {
  try {
    await connectDatabase();
    const roleService = new RoleService();
    const { roleId } = await roleService.ensureOwnerRoleExists();
    logger.info("Owner role ensured", { roleId });
    console.log("\n✅ Owner role ensured. roleId:", roleId, "\n");
    process.exit(0);
  } catch (error) {
    logger.error("Seed roles failed", error);
    console.error("\n❌ Seed roles failed:", error);
    process.exit(1);
  }
};

seedRoles();
