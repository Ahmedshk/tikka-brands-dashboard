import { Request, Response, NextFunction } from 'express';
import { LocationService } from '../services/location.service.js';
import { getInventoryKPIs } from '../services/marketman.service.js';
import { NotFoundError } from '../utils/errors.util.js';

const locationService = new LocationService();

export const getInventoryKPIsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === 'string' ? req.query.locationId : '';
    const location = await locationService.getById(locationId);
    if (!location) {
      throw new NotFoundError('Location not found');
    }
    const buyerGuid = location.marketManBuyerGuid?.trim();
    if (!buyerGuid) {
      res.status(400).json({
        success: false,
        message:
          'Location has no MarketMan buyer GUID. Configure it in Location Management.',
      });
      return;
    }

    const timezone = location.timezone?.trim() || 'America/Denver';
    const data = await getInventoryKPIs(buyerGuid, timezone);

    res.status(200).json({
      success: true,
      data: {
        currentFoodCost: data.currentFoodCost,
        inventoryValue: data.inventoryValue,
        wasteCost: data.wasteCost,
        pendingOrdersCount: data.pendingOrdersCount,
        countPeriodStart: data.countPeriodStart ?? null,
        countPeriodEnd: data.countPeriodEnd ?? null,
        pendingOrdersPeriodStart: data.pendingOrdersPeriodStart ?? null,
        pendingOrdersPeriodEnd: data.pendingOrdersPeriodEnd ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
};
