import { Request, Response, NextFunction } from 'express';
import { LocationService } from '../services/location.service.js';

const locationService = new LocationService();

export const createLocation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { storeName, address, squareLocationId, homebaseLocationId, timezone, businessStartTime } = req.body;
    const location = await locationService.create({
      storeName,
      address,
      squareLocationId,
      homebaseLocationId,
      timezone,
      businessStartTime,
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
    const result = await locationService.getPaginated(page, limit);
    res.status(200).json({
      success: true,
      data: {
        locations: result.locations,
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
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      res.status(400).json({ success: false, message: 'Invalid location id' });
      return;
    }
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
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      res.status(400).json({ success: false, message: 'Invalid location id' });
      return;
    }
    const { storeName, address, squareLocationId, homebaseLocationId, timezone, businessStartTime } = req.body;
    const location = await locationService.update(id, {
      ...(storeName !== undefined && { storeName }),
      ...(address !== undefined && { address }),
      ...(squareLocationId !== undefined && { squareLocationId }),
      ...(homebaseLocationId !== undefined && { homebaseLocationId }),
      ...(timezone !== undefined && { timezone }),
      ...(businessStartTime !== undefined && { businessStartTime }),
    });
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
    const id = req.params.id;
    if (id === undefined || Array.isArray(id)) {
      res.status(400).json({ success: false, message: 'Invalid location id' });
      return;
    }
    await locationService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Location deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
