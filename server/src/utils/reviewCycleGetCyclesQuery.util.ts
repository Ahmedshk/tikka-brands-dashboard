import { ReviewCycleModel } from "../models/reviewCycle.model.js";
import { UserModel } from "../models/user.model.js";
import { REVIEW_CYCLE_PAST_STATUSES } from "../types/reviewCycle.types.js";

export type ReviewCycleGetCyclesStatusQuery = {
  pastOnly?: boolean;
  status?: string;
  activeOnly?: boolean;
};

export function buildReviewCycleListStatusFilter(
  query: ReviewCycleGetCyclesStatusQuery,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.pastOnly) filter.status = { $in: REVIEW_CYCLE_PAST_STATUSES };
  else if (query.status) filter.status = query.status;
  else if (query.activeOnly) filter.status = { $nin: REVIEW_CYCLE_PAST_STATUSES };
  return filter;
}

export type ResolveReviewCycleListEmployeeIdsOptions = {
  /** Use `undefined` when absent (required key avoids exactOptionalPropertyTypes on the caller). */
  userId: string | undefined;
  actorUserId: string | undefined;
  locationId: string | undefined;
  locationIds?: string[] | undefined;
  employeeNameSearch: string | undefined;
  filter: Record<string, unknown>;
  escapeRegex: (s: string) => string;
  getVisibleEmployeeIds: (actorUserId: string | null) => Promise<string[] | null>;
  filterEmployeeIdsByNavbarLocation: (
    employeeIds: string[],
    locationId: string,
  ) => Promise<string[]>;
};

async function narrowEmployeeIdsByNavbarLocationId(
  employeeIdFilter: string[] | null,
  locationId: string,
  filter: Record<string, unknown>,
  filterEmployeeIdsByNavbarLocation: ResolveReviewCycleListEmployeeIdsOptions["filterEmployeeIdsByNavbarLocation"],
): Promise<{ employeeIdFilter: string[] | null; empty: boolean }> {
  const trimmed = locationId.trim();
  if (!trimmed) {
    return { employeeIdFilter, empty: false };
  }

  if (employeeIdFilter !== null) {
    if (employeeIdFilter.length === 0) {
      return { employeeIdFilter: null, empty: true };
    }
    const next = await filterEmployeeIdsByNavbarLocation(employeeIdFilter, trimmed);
    return next.length === 0
      ? { employeeIdFilter: null, empty: true }
      : { employeeIdFilter: next, empty: false };
  }

  const distinctRaw = await ReviewCycleModel.distinct("employeeId", { ...filter });
  const distinctIds = distinctRaw.map(String);
  const next = await filterEmployeeIdsByNavbarLocation(distinctIds, trimmed);
  return next.length === 0
    ? { employeeIdFilter: null, empty: true }
    : { employeeIdFilter: next, empty: false };
}

async function narrowEmployeeIdsByNameSearch(
  employeeIdFilter: string[] | null,
  nameSearch: string,
  escapeRegex: (s: string) => string,
): Promise<{ employeeIdFilter: string[] | null; empty: boolean }> {
  const trimmed = nameSearch.trim();
  if (!trimmed) {
    return { employeeIdFilter, empty: false };
  }

  const rx = new RegExp(escapeRegex(trimmed), "i");
  const matchingUsers = await UserModel.find({
    $or: [{ firstName: rx }, { lastName: rx }],
  })
    .select("_id")
    .lean();
  const nameMatchIds = matchingUsers.map((u) => String(u._id));
  if (nameMatchIds.length === 0) {
    return { employeeIdFilter: null, empty: true };
  }

  const nameSet = new Set(nameMatchIds);
  let next: string[];
  if (employeeIdFilter === null) {
    next = nameMatchIds;
  } else {
    next = employeeIdFilter.filter((id) => nameSet.has(id));
  }

  return next.length === 0
    ? { employeeIdFilter: null, empty: true }
    : { employeeIdFilter: next, empty: false };
}

/**
 * Resolves optional employeeId constraints for the review cycle list (visibility, navbar location, name search).
 */
export async function resolveReviewCycleListEmployeeIds(
  options: ResolveReviewCycleListEmployeeIdsOptions,
): Promise<{ employeeIdFilter: string[] | null; empty: boolean }> {
  const {
    userId,
    actorUserId,
    locationId,
    locationIds,
    employeeNameSearch,
    filter,
    escapeRegex,
    getVisibleEmployeeIds,
    filterEmployeeIdsByNavbarLocation,
  } = options;

  let employeeIdFilter: string[] | null = userId
    ? [userId]
    : await getVisibleEmployeeIds(actorUserId ?? null);

  const locIds =
    locationIds && locationIds.length > 0
      ? locationIds
      : locationId?.trim()
        ? [locationId.trim()]
        : [];

  if (locIds.length > 1) {
    const union = new Set<string>();
    for (const lid of locIds) {
      const locResult = await narrowEmployeeIdsByNavbarLocationId(
        employeeIdFilter,
        lid,
        filter,
        filterEmployeeIdsByNavbarLocation,
      );
      if (locResult.empty) continue;
      for (const id of locResult.employeeIdFilter ?? []) {
        union.add(id);
      }
    }
    if (union.size === 0) {
      return { employeeIdFilter: null, empty: true };
    }
    employeeIdFilter = [...union];
  } else {
    const locResult = await narrowEmployeeIdsByNavbarLocationId(
      employeeIdFilter,
      locIds[0] ?? "",
      filter,
      filterEmployeeIdsByNavbarLocation,
    );
    if (locResult.empty) return locResult;
    employeeIdFilter = locResult.employeeIdFilter;
  }

  const nameResult = await narrowEmployeeIdsByNameSearch(
    employeeIdFilter,
    employeeNameSearch ?? "",
    escapeRegex,
  );
  if (nameResult.empty) return nameResult;

  return { employeeIdFilter: nameResult.employeeIdFilter, empty: false };
}
