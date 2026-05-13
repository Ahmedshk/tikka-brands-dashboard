/** Inputs aligned with {@link UserService.getUsers} list filters (excluding pagination / location). */
export type UserListFilterInput = {
  search?: string;
  roleId?: string;
  roleIds?: string[];
  excludeUserIds?: string[];
  showArchived?: boolean;
};

export type UserListRepoFilterParams = {
  search?: string;
  roleId?: string;
  roleIds?: string[];
  excludeUserIds?: string[];
  showArchived: boolean;
};

/** Maps dashboard filters to repository `findWithFilters*` params (roleIds wins over roleId). */
export function buildUserListRepoFilterParams(
  filters?: UserListFilterInput,
): UserListRepoFilterParams {
  const out: UserListRepoFilterParams = {
    showArchived: filters?.showArchived ?? false,
  };
  if (filters?.search !== undefined && filters.search !== "") {
    out.search = filters.search;
  }
  if (filters?.roleIds && filters.roleIds.length > 0) {
    out.roleIds = filters.roleIds;
  } else if (filters?.roleId !== undefined && filters.roleId !== "") {
    out.roleId = filters.roleId;
  }
  if (filters?.excludeUserIds && filters.excludeUserIds.length > 0) {
    out.excludeUserIds = filters.excludeUserIds;
  }
  return out;
}
