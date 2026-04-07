import { Request, Response, NextFunction } from "express";
import { RoleService } from "../services/role.service.js";
import { NotFoundError } from "../utils/errors.util.js";

const roleService = new RoleService();

export const listRoles = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const activeOnly = req.query.activeOnly === "true";
    const roles = await roleService.list(activeOnly);
    res.status(200).json({
      success: true,
      data: { roles },
    });
  } catch (error) {
    next(error);
  }
};

/** Training hierarchy only: id, name, reportsTo. Allowed for training-management (not full /roles list). */
export const listRoleHierarchySnapshot = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const activeOnly = req.query.activeOnly === "true";
    const roles = await roleService.listHierarchySnapshot(activeOnly);
    res.status(200).json({
      success: true,
      data: { roles },
    });
  } catch (error) {
    next(error);
  }
};

export const getRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      res.status(400).json({ success: false, message: "Invalid role id" });
      return;
    }
    const role = await roleService.getById(id);
    if (!role) {
      throw new NotFoundError("Role not found");
    }
    res.status(200).json({
      success: true,
      data: { role },
    });
  } catch (error) {
    next(error);
  }
};

export const updateHierarchy = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { mappings } = req.body;
    const roles = await roleService.updateHierarchy(mappings);
    res.status(200).json({
      success: true,
      message: "Hierarchy updated successfully",
      data: { roles },
    });
  } catch (error) {
    next(error);
  }
};

export const createRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, description, permissions, locations, reportsTo } = req.body;
    const role = await roleService.create({ name, description, permissions, locations, reportsTo });
    res.status(201).json({
      success: true,
      message: "Role created successfully",
      data: { role },
    });
  } catch (error) {
    next(error);
  }
};

export const updateRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      res.status(400).json({ success: false, message: "Invalid role id" });
      return;
    }
    const { name, description, permissions, locations, reportsTo } = req.body;
    const role = await roleService.update(id, {
      name,
      description,
      permissions,
      locations,
      reportsTo,
    });
    if (!role) {
      throw new NotFoundError("Role not found");
    }
    res.status(200).json({
      success: true,
      message: "Role updated successfully",
      data: { role },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      res.status(400).json({ success: false, message: "Invalid role id" });
      return;
    }
    const result = await roleService.delete(id);
    if (!result.deleted && !result.deactivated) {
      throw new NotFoundError("Role not found");
    }
    res.status(200).json({
      success: true,
      message: result.deactivated
        ? "Role deactivated (in use by one or more users)"
        : "Role deleted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
