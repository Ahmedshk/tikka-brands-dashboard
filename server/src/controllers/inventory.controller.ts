import { Request, Response, NextFunction } from 'express';
import { LocationService } from '../services/location.service.js';
import {
  getInventoryKPIs,
  getValidCountDatesWithCacheFallback,
} from '../services/marketman.service.js';
import { isExternalDataCacheReadEnabled } from '../config/externalDataCache.config.js';
import { NotFoundError } from '../utils/errors.util.js';
import { parseInventoryKpiRequest } from '../utils/inventoryKpiControllerHelpers.util.js';
import {
  getOrderTrackerRows,
  parseOrderTrackerQuery,
} from '../utils/inventoryOrderTrackerControllerHelpers.util.js';

const locationService = new LocationService();

export const getInventoryKPIsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const parsed = parseInventoryKpiRequest(req);
    if (parsed.kind === "bad_request") {
      res.status(400).json({ success: false, message: parsed.message });
      return;
    }
    if (parsed.kind === "forbidden") {
      res.status(403).json({ success: false, message: parsed.message });
      return;
    }
    if (parsed.kind === "empty_ok") {
      res.status(200).json({ success: true, data: {} });
      return;
    }
    const {
      locationId,
      metrics,
      pendingOrdersPeriod,
      countPeriodStart,
      countPeriodEnd,
    } = parsed.inputs;

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
    const useCacheRead =
      isExternalDataCacheReadEnabled() && Boolean(locationId.trim());
    const data = await getInventoryKPIs(
      buyerGuid,
      timezone,
      metrics,
      pendingOrdersPeriod,
      countPeriodStart,
      countPeriodEnd,
      useCacheRead ? locationId : null,
    );

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getValidCountDatesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === 'string' ? req.query.locationId : '';
    if (!locationId) {
      res.status(400).json({ success: false, message: 'Location ID is required' });
      return;
    }
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
    const result = await getValidCountDatesWithCacheFallback(
      locationId,
      buyerGuid,
    );
    if (!result) {
      res.status(200).json({
        success: true,
        data: { startDates: [], endDates: [] },
      });
      return;
    }
    res.status(200).json({
      success: true,
      data: {
        startDates: result.startDates,
        endDates: result.endDates,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getOrdersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { locationId, periodType, periodStart, periodEnd } = parseOrderTrackerQuery(req);

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
    const rowsResult = await getOrderTrackerRows({
      locationId,
      buyerGuid,
      timezone,
      periodType,
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
    });
    if (rowsResult.kind === "bad_request") {
      res.status(400).json({ success: false, message: rowsResult.message });
      return;
    }

    res.status(200).json({
      success: true,
      data: { orders: rowsResult.rows },
    });
  } catch (error) {
    next(error);
  }
};
