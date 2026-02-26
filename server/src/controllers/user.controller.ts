import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service.js';
import { NotFoundError, ValidationError } from '../utils/errors.util.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { PROFILE_IMAGE_FOLDER } from '../middleware/upload-profile.middleware.js';

const userService = new UserService();

function toUserDTO(
  req: Request,
  user: {
    _id?: string | { toString(): string };
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    squareId?: string;
    homebaseId?: string;
    role?: string | null;
    roleId?: string | null;
    isActive?: boolean;
    status?: string;
    invitationSentAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
    password?: string;
    profileImagePublicId?: string | null;
    [key: string]: unknown;
  }
) {
  const id = user._id != null ? (typeof user._id === 'string' ? user._id : user._id.toString()) : undefined;
  const base = `${req.protocol}://${req.get('host') ?? ''}`.replace(/\/$/, '');
  const profileImageUrl =
    id && user.profileImagePublicId ? `${base}/api/proxy/image/${id}` : null;
  return {
    _id: id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    squareId: user.squareId,
    homebaseId: user.homebaseId,
    role: user.role ?? null,
    roleId: user.roleId ?? null,
    isActive: user.isActive ?? true,
    status: user.status ?? 'active',
    invitationSentAt: user.invitationSentAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    profileImageUrl,
  };
}

export const listUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const search = req.query.search as string | undefined;
    const roleId = req.query.roleId as string | undefined;
    const locationId = req.query.locationId as string | undefined;
    const page = req.query.page != null ? Number(req.query.page) : undefined;
    const pageSize = req.query.pageSize != null ? Number(req.query.pageSize) : undefined;
    const result = await userService.getUsers({
      search,
      roleId,
      locationId,
      page,
      pageSize,
    });
    const dtos = result.users.map((u) => toUserDTO(req, u));
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
    const { firstName, lastName, email, phone, squareId, homebaseId, roleId, invite } = req.body;
    const user = await userService.createUser(
      {
        firstName,
        lastName,
        email,
        phone,
        squareId,
        homebaseId,
        roleId: roleId || null,
        profileImagePublicId: profileImagePublicId ?? undefined,
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
    const { id } = req.params;
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
    const { id } = req.params;
    const { firstName, lastName, email, phone, squareId, homebaseId, roleId, isActive, profileImagePublicId } = req.body;
    const user = await userService.updateUser(id, {
      firstName,
      lastName,
      email,
      phone,
      squareId,
      homebaseId,
      roleId: roleId ?? undefined,
      isActive,
      profileImagePublicId: profileImagePublicId ?? undefined,
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
    const { id } = req.params;
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

export const uploadProfileImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file || !file.buffer) {
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
