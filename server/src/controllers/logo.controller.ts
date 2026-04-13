import { Request, Response, NextFunction } from 'express';
import { LogoService } from '../services/logo.service.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { CLOUDINARY_FOLDERS } from '../config/upload.config.js';

const logoService = new LogoService();

export const createLogo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'Logo file is required' });
      return;
    }
    const result = await uploadToCloudinary(
      { buffer: req.file.buffer, mimetype: req.file.mimetype },
      CLOUDINARY_FOLDERS.location_logos,
    );
    const name = typeof req.body.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : undefined;
    const logo = await logoService.create(result.secure_url, result.public_id, name);
    res.status(201).json({
      success: true,
      message: 'Logo created successfully',
      data: { logo },
    });
  } catch (error) {
    next(error);
  }
};

export const getLogos = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const logos = await logoService.getAll();
    res.status(200).json({
      success: true,
      data: { logos },
    });
  } catch (error) {
    next(error);
  }
};

export const getLogoById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      res.status(400).json({ success: false, message: 'Invalid logo id' });
      return;
    }
    const logo = await logoService.getById(id);
    if (!logo) {
      res.status(404).json({
        success: false,
        message: 'Logo not found',
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: { logo },
    });
  } catch (error) {
    next(error);
  }
};
