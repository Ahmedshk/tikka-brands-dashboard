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
import { LocationGroupModel } from "../models/locationGroup.model.js";
import { LocationGroupRepository } from "../repositories/locationGroup.repository.js";
import { LocationService } from "../services/location.service.js";
import { GoalService } from "../services/goal.service.js";
import { putCachedResponse } from "../services/dashboardCache.service.js";
import { ALL_LOCATIONS_ID } from "../utils/locationScope.js";
import { locationScopeForIds } from "../utils/dashboardCacheScope.util.js";
import { COMMAND_CENTER_KPI_BREAKDOWN_VERSION } from "../utils/commandCenterKpiBreakdown.util.js";
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
import type { LocationForKpi, Period } from "../types/commandCenter.types.js";
import type {
  SalesTrendQueryParams,
  SalesTrendKpiQueryParams,
} from "../utils/salesTrendControllerHelpers.js";
import type { SalesLaborPeriodParams } from "../utils/salesLaborControllerHelpers.js";
import type { PeriodType } from "../utils/salesTrendDateRange.util.js";

const SALES_LABOR_PERIOD_TYPES: ReadonlyArray<PeriodType> = [
  "today",
  "last7days",
  "last30days",
  "last52weeks",
  "thisWeek",
  "thisMonth",
  "thisYear",
  "custom",
];

function extractSalesLaborPeriod(params: Record<string, unknown>): SalesLaborPeriodParams {
  const raw = params.period;
  if (raw == null || typeof raw !== "object") {
    return { periodType: "today" };
  }
  const r = raw as Record<string, unknown>;
  const typeRaw = typeof r.periodType === "string" ? r.periodType : "today";
  const periodType = (SALES_LABOR_PERIOD_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as PeriodType)
    : "today";
  return {
    periodType,
    periodStart: typeof r.periodStart === "string" ? r.periodStart : undefined,
    periodEnd: typeof r.periodEnd === "string" ? r.periodEnd : undefined,
  };
}

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
 * Resolves group -> member ids for the cron, which runs unfiltered as the
 * system user rather than as a request, so it reuses the repository directly.
 */
const LocationGroupMemberResolver = {
  async resolve(groupIds: string[]): Promise<Map<string, string[]>> {
    return new LocationGroupRepository().findMemberIdsByGroupIds(groupIds);
  },
};

/**
 * Build the all-locations response for one endpoint+params combination.
 * Returns the response body (the value the controller would `res.json({ data })`).
 *
 * `locationIds` scopes the computation to an explicit subset (a location group)
 * instead of every location. It is passed as a query `locationIds` value, which
 * `resolveTargetLocationIds` intersects with the system user's allow-list — the
 * same path a real request with `?locationIds=` takes, so the cached body is
 * identical to what a user selecting that group would receive.
 */
async function computeAllLocationsResponse(args: {
  endpoint: DashboardEndpoint;
  params: Record<string, unknown>;
  locationIds?: readonly string[];
}): Promise<unknown> {
  const { endpoint, params, locationIds } = args;
  const scopeQuery: Record<string, unknown> =
    locationIds != null && locationIds.length > 0
      ? { locationIds: [...locationIds], ...params }
      : { locationId: ALL_LOCATIONS_ID, ...params };
  const req = buildSystemReq(scopeQuery);

  switch (endpoint) {
    case "sales-labor.sales-trend": {
      const query = { ...scopeQuery } as unknown as SalesTrendQueryParams;
      return await buildAllLocationsSalesTrend({ req, query, locationService });
    }
    case "sales-labor.sales-trend-kpi": {
      const query = { ...scopeQuery } as unknown as SalesTrendKpiQueryParams;
      return await buildAllLocationsSalesTrendKpi({ req, query, locationService });
    }
    case "sales-labor.sales-by-category": {
      return await buildSalesByCategoryAllLocations({ req, locationService });
    }
    case "sales-labor.kpis": {
      const metrics = Array.isArray(params.metrics) ? (params.metrics as string[]) : [];
      const period = extractSalesLaborPeriod(params);
      return await buildAllLocationsSalesLaborKpis({ req, metrics, locationService, period });
    }
    case "sales-labor.hourly-breakdown": {
      const period = extractSalesLaborPeriod(params);
      return await buildAllLocationsHourlyBreakdown({ req, locationService, period });
    }
    case "sales-labor.timesheet": {
      const period = extractSalesLaborPeriod(params);
      const rows = await buildAllLocationsTimesheetRows({ req, locationService, period });
      return { rows };
    }
    case "command-center.kpis": {
      const metrics = Array.isArray(params.metrics) ? (params.metrics as string[]) : [];
      const periods = Array.isArray(params.periods)
        ? (params.periods as Period[])
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
    params: {
      metrics: [...getAllMetricIdsForPage("sales-labor-detail")].sort(),
      period: { periodType: "today" },
    },
  },
  {
    endpoint: "sales-labor.hourly-breakdown",
    params: { period: { periodType: "today" } },
  },
  {
    endpoint: "sales-labor.timesheet",
    params: { period: { periodType: "today" } },
  },
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
      periods: ["today", "yesterday", "weekToDate", "monthToDate", "lastWeek"].sort(),
      breakdownVersion: COMMAND_CENTER_KPI_BREAKDOWN_VERSION,
    },
  },
  { endpoint: "command-center.hourly-sales", params: {} },
];

/**
 * Upper bound on how many location groups get pre-warmed per cycle.
 *
 * Each seeded group costs one full fan-out per default entry, so the work grows
 * as `8 x (1 + groups)`. The history in this file is a warning: a cycle that grew
 * to ~6 minutes froze the site every 15 minutes. Capping here keeps the cycle
 * bounded no matter how many groups an admin creates; groups past the cap still
 * work, they just warm on first use via the live-on-miss path.
 */
const MAX_SEEDED_LOCATION_GROUPS = 8;

/**
 * Groups worth pre-warming, largest first.
 *
 * Single-member groups are skipped: `resolveLocationScopeForRequest` returns the
 * bare location id for a one-location request while `locationScopeForIds` always
 * prefixes `__all__|`, so seeding them would write an entry nothing ever reads.
 */
async function fetchSeedableGroupScopes(): Promise<
  Array<{ groupId: string; name: string; locationIds: string[] }>
> {
  const groups = await LocationGroupModel.find()
    .select({ _id: 1, name: 1 })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean()
    .exec();
  if (groups.length === 0) return [];

  const membersByGroup = await LocationGroupMemberResolver.resolve(
    groups.map((g) => String(g._id)),
  );

  const seedable = groups
    .map((g) => ({
      groupId: String(g._id),
      name: g.name,
      locationIds: membersByGroup.get(String(g._id)) ?? [],
    }))
    .filter((g) => g.locationIds.length > 1)
    .sort((a, b) => b.locationIds.length - a.locationIds.length);

  if (seedable.length > MAX_SEEDED_LOCATION_GROUPS) {
    logger.warn("[dashboard-cache] location-group seed trimmed by cap", {
      total: seedable.length,
      cap: MAX_SEEDED_LOCATION_GROUPS,
      skipped: seedable.length - MAX_SEEDED_LOCATION_GROUPS,
    });
  }
  return seedable.slice(0, MAX_SEEDED_LOCATION_GROUPS);
}

async function runRefreshCycle(): Promise<void> {
  const t0 = performance.now();
  const allLocationIds = await fetchAllLocationIds();
  const allLocationsScope = locationScopeForIds(allLocationIds);

  let refreshed = 0;
  let failed = 0;

  // NOTE: previously this cycle also iterated every all-locations entry in
  // `DashboardCache` and refreshed each one. With organic growth from
  // live-on-miss writes (custom date ranges, etc.) the entry count climbed
  // to ~23, which combined with the 8 hardcoded defaults made each cycle
  // take ~6 minutes — long enough that Mongo throughput collapsed and the
  // site froze every 15 minutes. Disabled until we add a smarter refresh
  // (e.g. only entries about to expire, or move heavy refreshes off-peak).
  // Dynamic entries now rely entirely on the freshness gate + TTL index:
  // first user request after expiry recomputes, same as a single-location
  // entry.

  // Seed hardcoded defaults so common views are never cold.
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

  // Seed each location group under its own scope. Without this, the first user
  // to select a group pays a live fan-out for that subset, since the seed above
  // only covers the full all-locations scope. Bounded by
  // MAX_SEEDED_LOCATION_GROUPS for the reasons in this file's history above.
  let groupScopes: Array<{ groupId: string; name: string; locationIds: string[] }> = [];
  try {
    groupScopes = await fetchSeedableGroupScopes();
  } catch (err) {
    logger.warn("[dashboard-cache] group scope discovery failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  for (const groupScope of groupScopes) {
    const scope = locationScopeForIds(groupScope.locationIds);
    for (const def of HARDCODED_DEFAULT_ENTRIES) {
      try {
        const data = await computeAllLocationsResponse({
          endpoint: def.endpoint,
          params: def.params,
          locationIds: groupScope.locationIds,
        });
        await putCachedResponse(
          { endpoint: def.endpoint, locationScope: scope, params: def.params },
          data,
        );
        refreshed += 1;
      } catch (err) {
        failed += 1;
        logger.warn("[dashboard-cache] group seed failed", {
          endpoint: def.endpoint,
          groupId: groupScope.groupId,
          groupName: groupScope.name,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  logger.info("[dashboard-cache] cron tick", {
    entriesRefreshed: refreshed,
    entriesFailed: failed,
    totalMs: Math.round(performance.now() - t0),
    allLocationIdsCount: allLocationIds.length,
    locationGroupsSeeded: groupScopes.length,
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

