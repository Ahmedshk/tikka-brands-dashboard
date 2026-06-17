import type { Request } from "express";
import mongoose from "mongoose";
import { performance } from "node:perf_hooks";
import { CommandCenterAlertDismissalModel } from "../models/commandCenterAlertDismissal.model.js";
import type { LocationService } from "../services/location.service.js";
import { getTodayInTimezone } from "./timezone.util.js";
import { getEffectivePagePermission } from "./permissions.util.js";
import { PAGE_COMPONENT_IDS } from "../config/kpi-metrics.config.js";
import {
  collectCommandCenterAlertsForUser,
  collectCommandCenterAlertsFromNotifications,
  loadCommandCenterNotificationsForUser,
  type CommandCenterAlertCategory,
  type CommandCenterCardRow,
} from "./commandCenterAlertsCollect.util.js";
import { parseLocationIdsFromQuery, resolveTargetLocationIds } from "./locationScope.js";
import {
  getLocationFanoutConcurrency,
  mapWithConcurrency,
} from "./boundedConcurrency.util.js";
import { getByIdCached } from "./perRequestCache.util.js";
import {
  summarizeAllLocationsTimings,
  timedPerLocation,
} from "./allLocationsTiming.util.js";

export type AlertsAccessFlags = {
  canFinancial: boolean;
  canInventory: boolean;
  canReputation: boolean;
};

type AlertsBuckets = Record<CommandCenterAlertCategory, CommandCenterCardRow[]>;

function createEmptyBuckets(): AlertsBuckets {
  return {
    financial_labor: [],
    inventory_supply_chain: [],
    reputation_hr: [],
  };
}

function pushTodayRows(
  buckets: AlertsBuckets,
  todayKey: string,
  collected: Array<{
    category: CommandCenterAlertCategory;
    createdKey: string;
    row: CommandCenterCardRow;
  }>,
): void {
  for (const item of collected) {
    if (item.createdKey !== todayKey) continue;
    buckets[item.category].push(item.row);
  }
}

function mergeBuckets(into: AlertsBuckets, from: AlertsBuckets): void {
  into.financial_labor.push(...from.financial_labor);
  into.inventory_supply_chain.push(...from.inventory_supply_chain);
  into.reputation_hr.push(...from.reputation_hr);
}

async function collectBucketsForLocation(
  args: {
    userId: string;
    locationId: string;
    timezone: string;
    todayKey: string;
    dismissed: Set<string>;
    flags: AlertsAccessFlags;
  },
): Promise<AlertsBuckets> {
  const buckets = createEmptyBuckets();
  const collected = await collectCommandCenterAlertsForUser({
    userId: args.userId,
    locationId: args.locationId,
    timezone: args.timezone,
    todayKey: args.todayKey,
    dismissed: args.dismissed,
    canFinancial: args.flags.canFinancial,
    canInventory: args.flags.canInventory,
    canReputation: args.flags.canReputation,
  });
  pushTodayRows(buckets, args.todayKey, collected);
  return buckets;
}

function collectBucketsForLocationFromNotifications(args: {
  notifications: readonly Awaited<
    ReturnType<typeof loadCommandCenterNotificationsForUser>
  >[number][];
  locationId: string;
  timezone: string;
  todayKey: string;
  dismissed: Set<string>;
  flags: AlertsAccessFlags;
}): AlertsBuckets {
  const buckets = createEmptyBuckets();
  const collected = collectCommandCenterAlertsFromNotifications({
    notifications: args.notifications,
    locationId: args.locationId,
    timezone: args.timezone,
    todayKey: args.todayKey,
    dismissed: args.dismissed,
    canFinancial: args.flags.canFinancial,
    canInventory: args.flags.canInventory,
    canReputation: args.flags.canReputation,
  });
  pushTodayRows(buckets, args.todayKey, collected);
  return buckets;
}

export function parseLocationId(req: Request): string {
  const explicit = parseLocationIdsFromQuery(req);
  if (explicit.length > 0) return explicit[0]!;
  return typeof req.query.locationId === "string" ? req.query.locationId.trim() : "";
}

export function hasLocationQuery(req: Request): boolean {
  return parseLocationIdsFromQuery(req).length > 0 || parseLocationId(req).length > 0;
}

export function componentPermissionsFromRequest(req: Request): AlertsAccessFlags {
  const user = req.user;
  if (user?.permissions == null) {
    return {
      canFinancial: false,
      canInventory: false,
      canReputation: false,
    };
  }

  const effectivePage = getEffectivePagePermission(
    user.permissions,
    user.permissionRemovals ?? null,
    "command-center",
    PAGE_COMPONENT_IDS["command-center"] ?? [],
    "Command Center",
    user.permissionOverrides ?? null,
  );
  const components = effectivePage?.components;
  return {
    canFinancial:
      !components?.length ||
      components.includes("full-page") ||
      components.includes("alerts-financial-labor"),
    canInventory:
      !components?.length ||
      components.includes("full-page") ||
      components.includes("alerts-inventory-supply-chain"),
    canReputation:
      !components?.length ||
      components.includes("full-page") ||
      components.includes("alerts-reputation-hr"),
  };
}

export function canAccessCategory(
  category: CommandCenterAlertCategory,
  flags: AlertsAccessFlags,
): boolean {
  switch (category) {
    case "financial_labor":
      return flags.canFinancial;
    case "inventory_supply_chain":
      return flags.canInventory;
    case "reputation_hr":
      return flags.canReputation;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export async function loadDismissedNotificationIds(userId: string): Promise<Set<string>> {
  const oidUser = new mongoose.Types.ObjectId(userId);
  const dismissals = await CommandCenterAlertDismissalModel.find({ userId: oidUser })
    .select("notificationId")
    .lean();
  return new Set(dismissals.map((d) => String(d.notificationId)));
}

export async function getAlertsBucketsForRequest(args: {
  req: Request;
  locationService: LocationService;
}): Promise<
  | { kind: "bad_request"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "ok"; buckets: AlertsBuckets }
> {
  const { req, locationService } = args;
  const locationId = parseLocationId(req);
  if (!hasLocationQuery(req)) return { kind: "bad_request", message: "locationId is required" };

  const targetIds = await resolveTargetLocationIds(req);
  if (targetIds.length > 1) {
    const tHandler = performance.now();
    const userId = req.user!.userId;
    const flags = componentPermissionsFromRequest(req);

    const [dismissed, notifications] = await Promise.all([
      loadDismissedNotificationIds(userId),
      loadCommandCenterNotificationsForUser(userId),
    ]);

    const merged = createEmptyBuckets();
    const perLocationMs: number[] = [];

    const perLoc = await mapWithConcurrency(
      targetIds,
      getLocationFanoutConcurrency(),
      async (lid) => {
        const { value, ms } = await timedPerLocation(async () => {
          const location = await getByIdCached(req, locationService, lid);
          if (!location) return null;
          const timezone = location.timezone?.trim() || "America/Denver";
          const todayKey = getTodayInTimezone(timezone);
          return collectBucketsForLocationFromNotifications({
            notifications,
            locationId: lid,
            timezone,
            todayKey,
            dismissed,
            flags,
          });
        });
        perLocationMs.push(ms);
        return value;
      },
    );

    for (const buckets of perLoc) {
      if (buckets) mergeBuckets(merged, buckets);
    }

    summarizeAllLocationsTimings({
      route: "GET /command-center/alerts",
      locationCount: targetIds.length,
      totalMs: Math.round(performance.now() - tHandler),
      perLocationMs,
    });

    return { kind: "ok", buckets: merged };
  }

  const location = await locationService.getById(locationId);
  if (!location) return { kind: "not_found", message: "Location not found" };

  const timezone = location.timezone?.trim() || "America/Denver";
  const todayKey = getTodayInTimezone(timezone);

  const flags = componentPermissionsFromRequest(req);
  const userId = req.user!.userId;
  const dismissed = await loadDismissedNotificationIds(userId);

  const buckets = await collectBucketsForLocation({
    userId,
    locationId,
    timezone,
    todayKey,
    dismissed,
    flags,
  });

  return { kind: "ok", buckets };
}

function parseCategory(req: Request): string {
  return typeof req.query.category === "string" ? req.query.category.trim() : "";
}

function pushHistoryRows(
  out: CommandCenterCardRow[],
  category: CommandCenterAlertCategory,
  todayKey: string,
  collected: Array<{
    category: CommandCenterAlertCategory;
    createdKey: string;
    row: CommandCenterCardRow;
  }>,
): void {
  for (const item of collected) {
    if (item.category !== category) continue;
    if (item.createdKey === todayKey) continue;
    out.push(item.row);
  }
}

export async function getAlertHistoryForRequest(args: {
  req: Request;
  locationService: LocationService;
}): Promise<
  | { kind: "bad_request"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "ok"; alerts: CommandCenterCardRow[] }
> {
  const { req, locationService } = args;

  const locationId = parseLocationId(req);
  if (!hasLocationQuery(req)) return { kind: "bad_request", message: "locationId is required" };

  const category = parseCategory(req) as CommandCenterAlertCategory;

  const flags = componentPermissionsFromRequest(req);
  if (!canAccessCategory(category, flags)) {
    return { kind: "forbidden", message: "Forbidden" };
  }

  const userId = req.user!.userId;
  const dismissed = await loadDismissedNotificationIds(userId);

  const targetIds = await resolveTargetLocationIds(req);
  if (targetIds.length > 1) {
    const tHandler = performance.now();
    const notifications = await loadCommandCenterNotificationsForUser(userId);
    const perLocationMs: number[] = [];

    const perLoc = await mapWithConcurrency(
      targetIds,
      getLocationFanoutConcurrency(),
      async (lid) => {
        const { value, ms } = await timedPerLocation(async () => {
          const location = await getByIdCached(req, locationService, lid);
          if (!location) return null;
          const timezone = location.timezone?.trim() || "America/Denver";
          const todayKey = getTodayInTimezone(timezone);
          const collected = collectCommandCenterAlertsFromNotifications({
            notifications,
            locationId: lid,
            timezone,
            todayKey,
            dismissed,
            canFinancial: flags.canFinancial,
            canInventory: flags.canInventory,
            canReputation: flags.canReputation,
          });
          return { todayKey, collected };
        });
        perLocationMs.push(ms);
        return value;
      },
    );

    const alerts: CommandCenterCardRow[] = [];
    for (const entry of perLoc) {
      if (!entry) continue;
      pushHistoryRows(alerts, category, entry.todayKey, entry.collected);
    }

    summarizeAllLocationsTimings({
      route: `GET /command-center/alerts/history (${category})`,
      locationCount: targetIds.length,
      totalMs: Math.round(performance.now() - tHandler),
      perLocationMs,
    });

    return { kind: "ok", alerts };
  }

  const location = await locationService.getById(locationId);
  if (!location) return { kind: "not_found", message: "Location not found" };

  const timezone = location.timezone?.trim() || "America/Denver";
  const todayKey = getTodayInTimezone(timezone);

  const collected = await collectCommandCenterAlertsForUser({
    userId,
    locationId,
    timezone,
    todayKey,
    dismissed,
    canFinancial: flags.canFinancial,
    canInventory: flags.canInventory,
    canReputation: flags.canReputation,
  });

  const alerts: CommandCenterCardRow[] = [];
  pushHistoryRows(alerts, category, todayKey, collected);

  return { kind: "ok", alerts };
}

