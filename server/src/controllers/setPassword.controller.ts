import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { UserRepository } from '../repositories/user.repository.js';
import { BadRequestError } from '../utils/errors.util.js';

const userRepository = new UserRepository();

const MESSAGE_LINK_INVALID_OR_MISSING =
  'The link is invalid or missing. Please ask your administrator to resend the verification email.';
const MESSAGE_LINK_EXPIRED_OR_REPLACED =
  'The link has expired or been replaced. Please ask your administrator to resend the verification email.';

export const validateSetPasswordToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = (req.query.token as string)?.trim();
    if (!token) {
      res.status(200).json({
        success: false,
        valid: false,
        message: MESSAGE_LINK_INVALID_OR_MISSING,
      });
      return;
    }

    const user = await userRepository.findByInvitationToken(token);
    if (!user) {
      res.status(200).json({
        success: false,
        valid: false,
        message: MESSAGE_LINK_EXPIRED_OR_REPLACED,
      });
      return;
    }

    const expiresAt = user.invitationTokenExpiresAt;
    if (!expiresAt || new Date() >= expiresAt) {
      res.status(200).json({
        success: false,
        valid: false,
        expired: true,
        message: MESSAGE_LINK_EXPIRED_OR_REPLACED,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { email: user.email, firstName: user.firstName },
    });
  } catch (error) {
    next(error);
  }
};

export const setPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, password, confirmPassword } = req.body as {
      token: string;
      password: string;
      confirmPassword: string;
    };

    if (password !== confirmPassword) {
      throw new BadRequestError('Passwords do not match');
    }

    const user = await userRepository.findByInvitationToken(token?.trim());
    if (!user) {
      res.status(200).json({
        success: false,
        valid: false,
        message: MESSAGE_LINK_EXPIRED_OR_REPLACED,
      });
      return;
    }

    const expiresAt = user.invitationTokenExpiresAt;
    if (!expiresAt || new Date() >= expiresAt) {
      res.status(200).json({
        success: false,
        valid: false,
        expired: true,
        message: MESSAGE_LINK_EXPIRED_OR_REPLACED,
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await userRepository.setPasswordAndClearInvitationToken(
      user._id.toString(),
      hashedPassword
    );

    res.status(200).json({
      success: true,
      message: 'Password set successfully. You can now sign in.',
    });
  } catch (error) {
    next(error);
  }
};
