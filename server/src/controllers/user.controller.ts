import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service.js';
import { TrainingAssignmentRepository } from '../repositories/trainingAssignment.repository.js';
import { ReviewCycleModel } from '../models/reviewCycle.model.js';
import { NotFoundError, ValidationError } from '../utils/errors.util.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { PROFILE_IMAGE_FOLDER } from '../middleware/upload-profile.middleware.js';
import { toUserDTO } from '../utils/userDto.util.js';

const userService = new UserService();
const assignmentRepository = new TrainingAssignmentRepository();

export const listUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const roleId = req.query.roleId as string | undefined;
    const roleIdsRaw = req.query.roleIds as string | undefined;
    const locationId = req.query.locationId as string | undefined;
    const excludeAssignedTrainingId = req.query.excludeAssignedTrainingId as string | undefined;
    const showArchived = req.query.showArchived === 'true';
    const page = req.query.page == null ? undefined : Number(req.query.page);
    const pageSize = req.query.pageSize == null ? undefined : Number(req.query.pageSize);
    const filters: { search?: string; roleId?: string; roleIds?: string[]; excludeUserIds?: string[]; locationId?: string; showArchived?: boolean; page?: number; pageSize?: number } = {};
    if (typeof search === 'string') filters.search = search;
    if (typeof roleIdsRaw === 'string' && roleIdsRaw.trim() !== '')
      filters.roleIds = roleIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    else if (typeof roleId === 'string') filters.roleId = roleId;
    if (typeof locationId === 'string') filters.locationId = locationId;
    if (typeof excludeAssignedTrainingId === 'string' && excludeAssignedTrainingId.trim() !== '') {
      const existing = await assignmentRepository.findByTrainingId(excludeAssignedTrainingId.trim());
      const assignedIds = existing.map((a) => String(a.userId));
      if (assignedIds.length > 0) filters.excludeUserIds = assignedIds;
    }
    filters.showArchived = showArchived;
    if (typeof page === 'number') filters.page = page;
    if (typeof pageSize === 'number') filters.pageSize = pageSize;
    const result = await userService.getUsers(filters);
    const activeCycleEmployeeIds = new Set(
      (await ReviewCycleModel.distinct('employeeId', { status: { $nin: ['cycle_complete', 'cycle_superseded'] } })).map(String)
    );
    const dtos = result.users.map((u) => {
      let id = '';
      if (u._id != null) {
        if (typeof u._id === 'string') id = u._id;
        else id = (u._id as { toString(): string }).toString();
      }
      return { ...toUserDTO(req, u), hasActiveReviewCycle: activeCycleEmployeeIds.has(id) };
    });
    res.status(200).json({
      success: true,
      data: {
        users: dtos,
        pagination: {
          totalItems: result.totalItems,
          totalPages: result.totalPages,
          page: result.page,
          pageSize: result.pageSize,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const profileImagePublicId = req.body.profileImagePublicId as string | undefined | null;
  try {
    const { firstName, lastName, email, phone, squareId, homebaseData, roleId, invite, startDate: startDateRaw } = req.body;
    const startDate =
      startDateRaw != null && typeof startDateRaw === 'string' && startDateRaw.trim() !== ''
        ? (() => {
            const d = new Date(startDateRaw.trim());
            return Number.isFinite(d.getTime()) ? d : undefined;
          })()
        : undefined;
    const user = await userService.createUser(
      {
        firstName,
        lastName,
        email,
        phone,
        squareId,
        homebaseData: homebaseData ?? null,
        roleId: roleId || null,
        profileImagePublicId: profileImagePublicId ?? null,
        startDate: startDate ?? null,
      },
      { sendInvite: invite === true }
    );
    res.status(201).json({
      success: true,
      data: { user: toUserDTO(req, user) },
    });
  } catch (error) {
    if (profileImagePublicId && typeof profileImagePublicId === 'string' && profileImagePublicId.trim()) {
      deleteFromCloudinary(profileImagePublicId.trim()).catch(() => {});
    }
    next(error);
  }
};

export const resendInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      throw new ValidationError('Invalid user id');
    }
    const user = await userService.resendInvite(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.status(200).json({
      success: true,
      data: { user: toUserDTO(req, user) },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      throw new ValidationError('Invalid user id');
    }
    const {
      firstName,
      lastName,
      email,
      phone,
      squareId,
      homebaseData,
      roleId,
      isActive,
      profileImagePublicId,
      permissionOverrides,
      locationOverrides,
      permissionRemovals,
      locationRemovals,
      startDate: startDateRaw,
    } = req.body;
    let startDate: Date | null | undefined;
    if (startDateRaw === null || (typeof startDateRaw === 'string' && startDateRaw.trim() === '')) {
      startDate = null;
    } else if (typeof startDateRaw === 'string') {
      const d = new Date(startDateRaw.trim());
      startDate = Number.isFinite(d.getTime()) ? d : undefined;
    } else {
      startDate = undefined;
    }
    const user = await userService.updateUser(id, {
      firstName,
      lastName,
      email,
      phone,
      squareId,
      ...(homebaseData !== undefined && { homebaseData }),
      roleId: roleId ?? undefined,
      isActive,
      profileImagePublicId: profileImagePublicId ?? undefined,
      ...(permissionOverrides === undefined ? {} : { permissionOverrides }),
      ...(locationOverrides === undefined ? {} : { locationOverrides }),
      ...(permissionRemovals === undefined ? {} : { permissionRemovals }),
      ...(locationRemovals === undefined ? {} : { locationRemovals }),
      ...(startDate !== undefined && { startDate: startDate ?? null }),
    });
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.status(200).json({
      success: true,
      data: { user: toUserDTO(req, user) },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      throw new ValidationError('Invalid user id');
    }
    await userService.deleteUser(id);
    res.status(200).json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    next(error);
  }
};

export const syncFromSquare = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { locationId } = req.body;
    const result = await userService.syncFromSquare(locationId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const syncFromHomebase = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { locationId } = req.body;
    const result = await userService.syncFromHomebase(locationId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const terminateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      throw new ValidationError('Invalid user id');
    }
    const user = await userService.terminateUser(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.status(200).json({
      success: true,
      data: { user: toUserDTO(req, user) },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadProfileImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = req.file;
    if (!file?.buffer) {
      throw new ValidationError('No image file provided. Use multipart field "image".');
    }
    const result = await uploadToCloudinary(
      { buffer: file.buffer, mimetype: file.mimetype },
      PROFILE_IMAGE_FOLDER
    );
    res.status(200).json({
      success: true,
      data: { profileImagePublicId: result.public_id },
    });
  } catch (error) {
    next(error);
  }
};
