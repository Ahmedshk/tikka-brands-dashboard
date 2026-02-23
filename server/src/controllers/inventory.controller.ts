import { Request, Response, NextFunction } from 'express';
import { LocationService } from '../services/location.service.js';
import {
  getInventoryKPIs,
  getOrderTrackerRanges,
  getOrdersByDeliveryDate,
  getOrdersBySentDate,
  mergeOrdersByOrderNumber,
  type MarketManOrder,
  type OrderTrackerPeriodType,
} from '../services/marketman.service.js';
import { NotFoundError } from '../utils/errors.util.js';

const locationService = new LocationService();

/** Parse MarketMan UTC date string (yyyy/MM/dd HH:mm:ss) to Date for sorting. */
function parseMarketManUtc(s: string | undefined): Date | null {
  if (!s || typeof s !== 'string') return null;
  const match = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!match) return null;
  const [, y, m, d, h, min, sec] = match;
  const t = Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(h),
    Number(min),
    Number(sec),
  );
  return Number.isNaN(t) ? null : new Date(t);
}

/** Format a UTC date for display in a timezone (e.g. "Mar 25, 2025"). */
function formatOrderDateInTz(utcDateString: string | undefined, timezone: string): string {
  const d = parseMarketManUtc(utcDateString);
  if (!d) return '';
  try {
    return d.toLocaleDateString('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

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
        foodCostPercent: data.foodCostPercent ?? null,
        theoreticalUsage: data.theoreticalUsage ?? null,
        theoreticalUsagePercent: data.theoreticalUsagePercent ?? null,
        varianceItems: data.varianceItems ?? [],
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

export interface OrderTrackerOrderDto {
  poNumber: string;
  supplier: string;
  deliveryDate: string;
  sentDate: string;
  status: string;
  orderDetails: MarketManOrder;
}

export const getOrdersHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const locationId =
      typeof req.query.locationId === 'string' ? req.query.locationId : '';
    const periodType = (req.query.periodType as OrderTrackerPeriodType) || 'currentMonth';
    const periodStart = typeof req.query.periodStart === 'string' ? req.query.periodStart : undefined;
    const periodEnd = typeof req.query.periodEnd === 'string' ? req.query.periodEnd : undefined;

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
    const { api: apiType, ranges } = getOrderTrackerRanges(
      periodType,
      timezone,
      periodStart,
      periodEnd,
    );

    let results: MarketManOrder[][];
    if (apiType === 'both') {
      const [range] = ranges;
      const [byDelivery, bySent] = await Promise.all([
        getOrdersByDeliveryDate(buyerGuid, range.dateTimeFromUTC, range.dateTimeToUTC),
        getOrdersBySentDate(buyerGuid, range.dateTimeFromUTC, range.dateTimeToUTC),
      ]);
      results = [byDelivery, bySent];
    } else {
      const fetchFn = apiType === 'sent' ? getOrdersBySentDate : getOrdersByDeliveryDate;
      results = await Promise.all(
        ranges.map((r) => fetchFn(buyerGuid, r.dateTimeFromUTC, r.dateTimeToUTC)),
      );
    }

    let orders: MarketManOrder[] =
      results.length > 1 ? mergeOrdersByOrderNumber(results) : results[0] ?? [];

    const dateField = apiType === 'sent' ? 'SentDateUTC' : 'DeliveryDateUTC';
    const rows: OrderTrackerOrderDto[] = orders.map((order) => {
      const utcDate = (order as Record<string, string | undefined>)[dateField];
      const sentDateUtc = (order as Record<string, string | undefined>).SentDateUTC;
      return {
        poNumber: String(order.OrderNumber ?? '').trim() || '—',
        supplier: String(order.VendorName ?? '').trim() || '—',
        deliveryDate: formatOrderDateInTz(utcDate, timezone),
        sentDate: formatOrderDateInTz(sentDateUtc, timezone),
        status: String(order.OrderStatusUIName ?? '').trim() || '—',
        orderDetails: order,
      };
    });

    rows.sort((a, b) => {
      const da = parseMarketManUtc(
        (a.orderDetails as Record<string, string | undefined>)[dateField],
      );
      const db = parseMarketManUtc(
        (b.orderDetails as Record<string, string | undefined>)[dateField],
      );
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.getTime() - da.getTime();
    });

    res.status(200).json({
      success: true,
      data: { orders: rows },
    });
  } catch (error) {
    next(error);
  }
};
