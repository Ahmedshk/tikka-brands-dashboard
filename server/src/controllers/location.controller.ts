import { Request, Response, NextFunction } from 'express';
import {
  LocationService,
  type GetLocationsPaginatedOptions,
} from '../services/location.service.js';
import {
  validateLocationId,
  buildUpdateLocationData,
} from '../utils/locationControllerHelpers.js';
import { LogoService } from '../services/logo.service.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { CLOUDINARY_FOLDERS } from '../config/upload.config.js';
import type { ILocationListItem, ILocationResponse } from '../types/location.types.js';

const locationService = new LocationService();
const logoService = new LogoService();

function toLocationListItem(loc: ILocationResponse): ILocationListItem {
  return {
    _id: loc._id ?? '',
    storeName: loc.storeName,
    address: loc.address ?? '',
    timezone: loc.timezone ?? '',
    businessStartTime: loc.businessStartTime ?? '00:00',
    ...(loc.logoUrl != null && { logoUrl: loc.logoUrl }),
  };
}

export const createLocation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      storeName,
      address,
      squareLocationId,
      squareMerchantId,
      homebaseLocationId,
      timezone,
      businessStartTime,
      squareAccessToken,
      homebaseApiKey,
      logoId,
      marketManBuyerGuid,
      squareWebhookSignatureKey,
      googleBusinessAccountId,
      googleBusinessLocationId,
    } = req.body;

    let resolvedLogoId: string | undefined;

    if (req.file) {
      const result = await uploadToCloudinary(
        { buffer: req.file.buffer, mimetype: req.file.mimetype },
        CLOUDINARY_FOLDERS.location_logos,
      );
      const logo = await logoService.create(result.secure_url, result.public_id);
      resolvedLogoId = logo._id;
    } else if (logoId != null && logoId !== '') {
      resolvedLogoId = String(logoId).trim();
    }

    const location = await locationService.create({
      storeName,
      address,
      squareLocationId,
      ...(squareMerchantId != null &&
      typeof squareMerchantId === "string" &&
      squareMerchantId.trim() !== ""
        ? { squareMerchantId: squareMerchantId.trim() }
        : {}),
      homebaseLocationId,
      timezone,
      businessStartTime,
      squareAccessToken,
      homebaseApiKey,
      ...(resolvedLogoId != null && { logoId: resolvedLogoId }),
      marketManBuyerGuid: typeof marketManBuyerGuid === 'string' ? marketManBuyerGuid.trim() : '',
      ...(typeof squareWebhookSignatureKey === "string" &&
      squareWebhookSignatureKey.trim() !== ""
        ? { squareWebhookSignatureKey: squareWebhookSignatureKey.trim() }
        : {}),
      ...(typeof googleBusinessAccountId === "string" &&
      googleBusinessAccountId.trim() !== ""
        ? { googleBusinessAccountId: googleBusinessAccountId.trim() }
        : {}),
      ...(typeof googleBusinessLocationId === "string" &&
      googleBusinessLocationId.trim() !== ""
        ? { googleBusinessLocationId: googleBusinessLocationId.trim() }
        : {}),
    });
    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      data: { location },
    });
  } catch (error) {
    next(error);
  }
};

export const getLocations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const allowedIds = req.user?.allowedLocationIds;
    const locationRemovals = req.user?.locationRemovals ?? [];

    const listOptions: GetLocationsPaginatedOptions | undefined =
      Array.isArray(allowedIds) || locationRemovals.length > 0
        ? {
            ...(Array.isArray(allowedIds)
              ? { allowedLocationIds: allowedIds }
              : {}),
            ...(locationRemovals.length > 0
              ? { excludeLocationIds: locationRemovals }
              : {}),
          }
        : undefined;

    const result = await locationService.getPaginated(page, limit, listOptions);
    const listItems: ILocationListItem[] = result.locations.map(toLocationListItem);
    res.status(200).json({
      success: true,
      data: {
        locations: listItems,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLocationById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = validateLocationId(req.params.id, res);
    if (id === null) return;
    const location = await locationService.getById(id);
    if (!location) {
      res.status(404).json({
        success: false,
        message: 'Location not found',
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: { location },
    });
  } catch (error) {
    next(error);
  }
};

export const updateLocation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = validateLocationId(req.params.id, res);
    if (id === null) return;
    const updateData = buildUpdateLocationData(req.body as Record<string, unknown>);

    if (req.file) {
      const result = await uploadToCloudinary(
        { buffer: req.file.buffer, mimetype: req.file.mimetype },
        CLOUDINARY_FOLDERS.location_logos,
      );
      const logo = await logoService.create(result.secure_url, result.public_id);
      updateData.logoId = logo._id ?? null;
    } else if (req.body.clearLogo === 'true') {
      updateData.logoId = null;
    }

    const location = await locationService.update(id, updateData);
    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      data: { location },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteLocation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = validateLocationId(req.params.id, res);
    if (id === null) return;
    await locationService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Location deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
