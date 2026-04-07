import { Request, Response, NextFunction } from 'express';
import { LocationService } from '../services/location.service.js';
import {
  getInventoryKPIs,
  getValidCountDatesWithCacheFallback,
  getOrderTrackerRanges,
  getOrdersByDeliveryDate,
  getOrdersBySentDate,
  mergeOrdersByOrderNumber,
  type MarketManOrder,
  type OrderTrackerPeriodType,
} from '../services/marketman.service.js';
import { isExternalDataCacheReadEnabled } from '../config/externalDataCache.config.js';
import {
  loadMarketManOrdersFromOrderCacheByKindInRange,
} from '../utils/inventoryOrderCacheRead.util.js';
import type { OrderTrackerOrderDto } from '../types/inventory.types.js';
import { NotFoundError } from '../utils/errors.util.js';
import {
  filterAllowedMetrics,
  getAllMetricIdsForPage,
  parseMetricsQuery,
  PAGE_COMPONENT_IDS,
} from '../config/kpi-metrics.config.js';
import { getEffectivePagePermission } from '../utils/permissions.util.js';

const locationService = new LocationService();

const INVENTORY_KPI_METRICS = [
  'currentFoodCost',
  'inventoryValue',
  'wasteCost',
  'pendingOrdersCount',
  'foodCostPercent',
  'theoreticalUsage',
  'theoreticalUsagePercent',
  'varianceItems',
] as const;

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
    const queryMetrics = parseMetricsQuery(req.query.metrics);

    const effectivePage = getEffectivePagePermission(
      req.user?.permissions!,
      req.user?.permissionRemovals ?? null,
      'inventory-food-cost',
      PAGE_COMPONENT_IDS['inventory-food-cost'] ?? [],
      'Inventory & Food Cost',
      req.user?.permissionOverrides ?? null
    );
    const effectivePermissions =
      effectivePage != null
        ? { type: 'custom' as const, pages: [effectivePage] }
        : undefined;
    const allMetricIds = getAllMetricIdsForPage('inventory-food-cost');
    const allowedMetrics = effectivePermissions
      ? filterAllowedMetrics(effectivePermissions, 'inventory-food-cost', allMetricIds)
      : [];

    let metrics: string[] | undefined;
    if (queryMetrics?.length) {
      const invalid = queryMetrics.filter(
        (m) => !INVENTORY_KPI_METRICS.includes(m as (typeof INVENTORY_KPI_METRICS)[number])
      );
      if (invalid.length > 0) {
        res.status(400).json({ success: false, message: 'Invalid metric' });
        return;
      }
      metrics = queryMetrics.filter((m) => allowedMetrics.includes(m));
      if (metrics.length === 0) {
        res.status(403).json({ success: false, message: 'Insufficient permissions' });
        return;
      }
    } else {
      if (allowedMetrics.length === 0) {
        res.status(200).json({ success: true, data: {} });
        return;
      }
      metrics = allowedMetrics;
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

    const timezone = location.timezone?.trim() || 'America/Denver';
    const pendingOrdersPeriod =
      req.query.pendingOrdersPeriod === 'lastWeek' ? 'lastWeek' : 'thisWeek';
    const countPeriodStart =
      typeof req.query.countPeriodStart === 'string'
        ? req.query.countPeriodStart.trim()
        : undefined;
    const countPeriodEnd =
      typeof req.query.countPeriodEnd === 'string'
        ? req.query.countPeriodEnd.trim()
        : undefined;
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

export type { OrderTrackerOrderDto } from "../types/inventory.types.js";

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

    const useOrderCache =
      isExternalDataCacheReadEnabled() && Boolean(locationId.trim());

    let results: MarketManOrder[][];
    if (useOrderCache) {
      if (apiType === 'both') {
        const range = ranges[0];
        if (!range) {
          res.status(400).json({
            success: false,
            message: 'Invalid order tracker period or range.',
          });
          return;
        }
        const [allDelivery, allSent] = await Promise.all([
          loadMarketManOrdersFromOrderCacheByKindInRange(
            locationId,
            buyerGuid,
            'delivery',
            range,
          ),
          loadMarketManOrdersFromOrderCacheByKindInRange(
            locationId,
            buyerGuid,
            'sent',
            range,
          ),
        ]);
        results = [allDelivery, allSent];
      } else {
        const kind = apiType === 'sent' ? 'sent' : 'delivery';
        results = await Promise.all(
          ranges.map((r) =>
            loadMarketManOrdersFromOrderCacheByKindInRange(
              locationId,
              buyerGuid,
              kind,
              r,
            ),
          ),
        );
      }
    } else if (apiType === 'both') {
      const range = ranges[0];
      if (!range) {
        res.status(400).json({
          success: false,
          message: 'Invalid order tracker period or range.',
        });
        return;
      }
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
