import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service.js';
import { UserRepository } from '../repositories/user.repository.js';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors.util.js';
import { toUserDTO } from '../utils/userDto.util.js';
import { sendTransactionalEmail } from '../services/email.service.js';
import { logger } from '../utils/logger.util.js';

const userService = new UserService();
const userRepository = new UserRepository();
const SALT_ROUNDS = 10;

function getLoginUrl(): string {
  const base = (
    process.env.CLIENT_URL?.trim() ??
    process.env.APP_URL?.trim() ??
    process.env.FRONTEND_URL?.trim() ??
    ''
  ).replace(/\/$/, '');
  return base ? `${base}/login` : '/login';
}

export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      next(new UnauthorizedError());
      return;
    }
    const user = await userService.getUserById(userId);
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

export const putProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      next(new UnauthorizedError());
      return;
    }
    const { profileImagePublicId } = req.body as { profileImagePublicId: string | null };
    const user = await userService.updateUser(userId, { profileImagePublicId });
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

export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      next(new UnauthorizedError());
      return;
    }
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    };

    const doc = await userRepository.findByIdWithPassword(userId);
    if (!doc) {
      throw new NotFoundError('User not found');
    }
    const withPwd = doc as typeof doc & { password?: string };
    if (!withPwd.password) {
      throw new ValidationError('Password change is not available for this account.');
    }

    const ok = await bcrypt.compare(currentPassword, withPwd.password);
    if (!ok) {
      throw new ValidationError('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const updated = await userRepository.updateById(userId, { password: hashedPassword });
    if (!updated) {
      throw new NotFoundError('User not found');
    }

    const loginUrl = getLoginUrl();
    const firstName = updated.firstName?.trim() || 'there';
    const sent = await sendTransactionalEmail({
      to: updated.email,
      subject: 'Your Tikka Brands Dashboard password was changed',
      templateFile: 'password-changed-email.ejs',
      templateData: { firstName, loginUrl },
    });
    if (!sent) {
      logger.warn('Password-changed email was not sent (configuration or transport)', { userId });
    }

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    next(error);
  }
};
