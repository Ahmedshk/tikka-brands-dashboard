import { Request, Response, NextFunction } from 'express';
import { LocationService } from '../services/location.service.js';
import {
  validateLocationId,
  buildUpdateLocationData,
} from '../utils/locationControllerHelpers.js';
import type { ILocationListItem, ILocationResponse } from '../types/location.types.js';

const locationService = new LocationService();

function toLocationListItem(loc: ILocationResponse): ILocationListItem {
  return {
    _id: loc._id ?? '',
    storeName: loc.storeName,
    address: loc.address ?? '',
    timezone: loc.timezone ?? '',
    businessStartTime: loc.businessStartTime ?? '00:00',
    ...(loc.logoDataUrl != null && { logoDataUrl: loc.logoDataUrl }),
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
    } = req.body;
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
      ...(logoId != null && logoId !== '' && { logoId: String(logoId).trim() }),
      marketManBuyerGuid: typeof marketManBuyerGuid === 'string' ? marketManBuyerGuid.trim() : '',
      ...(typeof squareWebhookSignatureKey === "string" &&
      squareWebhookSignatureKey.trim() !== ""
        ? { squareWebhookSignatureKey: squareWebhookSignatureKey.trim() }
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
    const removalSet = locationRemovals.length > 0 ? new Set(locationRemovals) : null;

    const fetchAllForFilter = Array.isArray(allowedIds) || removalSet != null;
    let result = await locationService.getPaginated(
      fetchAllForFilter ? 1 : page,
      fetchAllForFilter ? 10000 : limit
    );
    if (Array.isArray(allowedIds)) {
      const allowedSet = new Set(allowedIds);
      let filtered = result.locations.filter(
        (loc) => loc._id != null && allowedSet.has(loc._id)
      );
      if (removalSet) {
        filtered = filtered.filter((loc) => loc._id != null && !removalSet.has(loc._id));
      }
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      result = {
        locations: filtered.slice(start, start + limit),
        total,
        page,
        limit,
        totalPages,
      };
    } else if (removalSet && result.locations.length > 0) {
      const filtered = result.locations.filter(
        (loc) => loc._id != null && !removalSet.has(loc._id)
      );
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      result = {
        locations: filtered.slice(start, start + limit),
        total,
        page,
        limit,
        totalPages,
      };
    }
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
