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

export const getRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
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

export const createRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, description, permissions, locations } = req.body;
    const role = await roleService.create({ name, description, permissions, locations });
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
    const { id } = req.params;
    const { name, description, permissions, locations } = req.body;
    const role = await roleService.update(id, {
      name,
      description,
      permissions,
      locations,
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
    const { id } = req.params;
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
