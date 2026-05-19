/**
 * Agenda job: refresh the dashboard response cache every 15 minutes.
 *
 * For each entry currently in `DashboardCache`, this job synthesizes a
 * "system" `req` (all locations, no permission removals), invokes the
 * matching all-locations builder, and upserts the fresh response. After a
 * single cycle, every user-visible entry is at most ~15 minutes old.
 *
 * A small list of `HARDCODED_DEFAULT_ENTRIES` is also seeded on every cycle
 * so the most common views (the initial-mount defaults the dashboard pages
 * render) always have a cached response — even immediately after deploy
 * when the collection is empty, the startup `agenda.now(...)` call populates
 * those entries within the first cycle.
 *
 * The job does NOT cover single-location entries that may exist in the cache
 * from lazy-on-miss population. Those rely on the freshness gate in
 * `dashboardCache.service` plus the Mongo TTL index — a single-location
 * entry not refreshed by the cron is treated as a miss after 18 minutes and
 * recomputed live by the next user request.
 */
import type { Agenda } from "agenda";
import type { Request } from "express";
import { performance } from "node:perf_hooks";
import { logger } from "../utils/logger.util.js";
import { LocationModel } from "../models/location.model.js";
import { LocationService } from "../services/location.service.js";
import { GoalService } from "../services/goal.service.js";
import { listAllCacheEntries, putCachedResponse } from "../services/dashboardCache.service.js";
import { ALL_LOCATIONS_ID } from "../utils/locationScope.js";
import { locationScopeForIds } from "../utils/dashboardCacheScope.util.js";
import { type DashboardEndpoint } from "../utils/dashboardCacheKey.util.js";
import {
  buildAllLocationsSalesTrend,
  buildAllLocationsSalesTrendKpi,
} from "../utils/salesTrendAllLocations.util.js";
import { buildSalesByCategoryAllLocations } from "../utils/salesByCategoryAllLocations.util.js";
import {
  buildAllLocationsSalesLaborKpis,
  buildAllLocationsHourlyBreakdown,
  buildAllLocationsTimesheetRows,
} from "../utils/salesLaborAllLocations.util.js";
import {
  buildAllLocationsCommandCenterKpis,
  buildAllLocationsHourlySales,
} from "../utils/commandCenterAllLocations.util.js";
import { getAllMetricIdsForPage } from "../config/kpi-metrics.config.js";
import type { LocationForKpi } from "../types/commandCenter.types.js";
import type {
  SalesTrendQueryParams,
  SalesTrendKpiQueryParams,
} from "../utils/salesTrendControllerHelpers.js";

const locationService = new LocationService();
const goalService = new GoalService();

function toLocationForKpi(location: {
  timezone?: string;
  businessStartTime?: string | null;
  squareLocationId?: string | null;
  homebaseLocationId?: string | null;
}): LocationForKpi {
  return {
    timezone: location.timezone ?? "",
    businessStartTime: location.businessStartTime ?? null,
    squareLocationId: location.squareLocationId?.trim() ?? null,
    homebaseLocationId: location.homebaseLocationId?.trim() ?? null,
  };
}

/**
 * Synthesize the minimum `req` the all-locations builders need. They only
 * touch `req.user.allowedLocationIds` (read by
 * `resolveEffectiveAllowedLocationIds`) and use `req` as a stable WeakMap key
 * for `perRequestCache`.
 */
function buildSystemReq(query: Record<string, unknown>): Request {
  return {
    query,
    user: {
      userId: "system-cron",
      email: "cron@dashboard-cache",
      role: "admin",
      allowedLocationIds: "all",
      permissionRemovals: null,
      locationRemovals: [],
      permissionOverrides: null,
    },
  } as unknown as Request;
}

async function fetchAllLocationIds(): Promise<string[]> {
  const docs = await LocationModel.find({}).select({ _id: 1 }).lean().exec();
  return docs.map((d) => String(d._id));
}

/**
 * Build the all-locations response for one endpoint+params combination.
 * Returns the response body (the value the controller would `res.json({ data })`).
 */
async function computeAllLocationsResponse(args: {
  endpoint: DashboardEndpoint;
  params: Record<string, unknown>;
}): Promise<unknown> {
  const { endpoint, params } = args;
  const req = buildSystemReq({
    locationId: ALL_LOCATIONS_ID,
    ...params,
  });

  switch (endpoint) {
    case "sales-labor.sales-trend": {
      const query = { locationId: ALL_LOCATIONS_ID, ...params } as SalesTrendQueryParams;
      return await buildAllLocationsSalesTrend({ req, query, locationService });
    }
    case "sales-labor.sales-trend-kpi": {
      const query = { locationId: ALL_LOCATIONS_ID, ...params } as SalesTrendKpiQueryParams;
      return await buildAllLocationsSalesTrendKpi({ req, query, locationService });
    }
    case "sales-labor.sales-by-category": {
      return await buildSalesByCategoryAllLocations({ req, locationService });
    }
    case "sales-labor.kpis": {
      const metrics = Array.isArray(params.metrics) ? (params.metrics as string[]) : [];
      return await buildAllLocationsSalesLaborKpis({ req, metrics, locationService });
    }
    case "sales-labor.hourly-breakdown": {
      return await buildAllLocationsHourlyBreakdown({ req, locationService });
    }
    case "sales-labor.timesheet": {
      const rows = await buildAllLocationsTimesheetRows({ req, locationService });
      return { rows };
    }
    case "command-center.kpis": {
      const metrics = Array.isArray(params.metrics) ? (params.metrics as string[]) : [];
      const periods = Array.isArray(params.periods)
        ? (params.periods as Array<"today" | "weekToDate">)
        : undefined;
      const result = await buildAllLocationsCommandCenterKpis({
        req,
        metrics,
        periods,
        wantNetSales: metrics.some((m) => /netSales/i.test(m)),
        wantLaborCost: metrics.some((m) => /labor/i.test(m)),
        wantReviewRating: metrics.some((m) => /review/i.test(m)),
        goalService,
        locationService,
        toLocationForKpi,
      });
      return result.data;
    }
    case "command-center.hourly-sales": {
      return await buildAllLocationsHourlySales({ req, locationService });
    }
    case "command-center.alerts": {
      // Per-user endpoint (notifications + dismissals are user-scoped) —
      // never run from the cron's synthesized "system" user. The iteration
      // below skips these entries; this case exists only for exhaustiveness.
      return { alerts: [] };
    }
  }
}

/**
 * The hardcoded set of cache entries the cron always tries to keep warm.
 * Mirrors the initial-mount defaults of each dashboard page so the very
 * first user request after deploy is a cache hit.
 */
interface DefaultEntry {
  endpoint: DashboardEndpoint;
  params: Record<string, unknown>;
}
const HARDCODED_DEFAULT_ENTRIES: ReadonlyArray<DefaultEntry> = [
  // sales-trend-reports defaults
  {
    endpoint: "sales-labor.sales-trend",
    params: {
      periodType: "today",
      comparisonType: "1DayPrior",
      metric: "netSales",
      groupBy: "none",
    },
  },
  {
    endpoint: "sales-labor.sales-trend-kpi",
    params: { periodType: "today", comparisonType: "1DayPrior" },
  },
  {
    endpoint: "sales-labor.sales-by-category",
    params: { periodType: "today", comparisonType: "1DayPrior" },
  },
  // sales-labor-detail defaults
  {
    endpoint: "sales-labor.kpis",
    params: { metrics: [...getAllMetricIdsForPage("sales-labor-detail")].sort() },
  },
  { endpoint: "sales-labor.hourly-breakdown", params: {} },
  { endpoint: "sales-labor.timesheet", params: {} },
  // command-center defaults
  //
  // `command-center.alerts` is intentionally omitted: that endpoint is
  // scoped per-user (it queries the current user's notifications and
  // dismissals), so a process-wide pre-computed cache entry can't be shared
  // across users. The controller for alerts is also not wrapped with the
  // cache-aside (it was already ~40ms in production), so no entry of this
  // kind ever lands in the collection.
  {
    endpoint: "command-center.kpis",
    params: {
      metrics: [...getAllMetricIdsForPage("command-center")].sort(),
      periods: ["today", "weekToDate"].sort(),
    },
  },
  { endpoint: "command-center.hourly-sales", params: {} },
];

async function runRefreshCycle(): Promise<void> {
  const t0 = performance.now();
  const allLocationIds = await fetchAllLocationIds();
  const allLocationsScope = locationScopeForIds(allLocationIds);

  // 1. Refresh every entry currently in the cache (covers organic growth from
  //    live-on-miss writes, including entries with custom periods).
  const existing = await listAllCacheEntries();
  const seenKeys = new Set<string>();
  let refreshed = 0;
  let failed = 0;
  for (const entry of existing) {
    seenKeys.add(entry.cacheKey);
    // For now only refresh all-locations entries. Single-location entries
    // expire via the freshness gate + TTL index and recompute on next user
    // request.
    if (!entry.locationScope.startsWith(`${ALL_LOCATIONS_ID}|`)) continue;
    // Skip alerts: per-user endpoint, can't be refreshed with a system req.
    if (entry.endpoint === "command-center.alerts") continue;
    try {
      const data = await computeAllLocationsResponse({
        endpoint: entry.endpoint,
        params: entry.params,
      });
      await putCachedResponse(
        { endpoint: entry.endpoint, locationScope: entry.locationScope, params: entry.params },
        data,
      );
      refreshed += 1;
    } catch (err) {
      failed += 1;
      logger.warn("[dashboard-cache] cron refresh failed for entry", {
        cacheKey: entry.cacheKey,
        endpoint: entry.endpoint,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. Seed hardcoded defaults so common views are never cold.
  for (const def of HARDCODED_DEFAULT_ENTRIES) {
    try {
      const data = await computeAllLocationsResponse({
        endpoint: def.endpoint,
        params: def.params,
      });
      await putCachedResponse(
        { endpoint: def.endpoint, locationScope: allLocationsScope, params: def.params },
        data,
      );
      refreshed += 1;
    } catch (err) {
      failed += 1;
      logger.warn("[dashboard-cache] cron seed failed", {
        endpoint: def.endpoint,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[dashboard-cache] cron tick", {
    entriesRefreshed: refreshed,
    entriesFailed: failed,
    totalMs: Math.round(performance.now() - t0),
    allLocationIdsCount: allLocationIds.length,
  });
}

export const DASHBOARD_CACHE_REFRESH_JOB_NAME = "dashboard-cache:refresh-15m";

export function registerDashboardCacheJobs(agenda: Agenda): void {
  agenda.define(DASHBOARD_CACHE_REFRESH_JOB_NAME, async () => {
    try {
      await runRefreshCycle();
    } catch (err) {
      logger.error("[dashboard-cache] cron tick failed", { err });
    }
  });
}

