import type { Dispatch, SetStateAction } from 'react';
import type { RolePermissions } from '../../types/rbac.types';
import { PERMISSION_PAGES } from '../../config/permissions.config';
import {
  FULL_PAGE_COMPONENT_ID,
  hasPageInCustom,
  getPageEntry,
  hasComponentAccess,
} from '../../utils/addEditRoleModalHelpers';
import {
  setOverridesPageSelectAll,
  setOverridesPageComponent,
  addPageToRemovals,
  removePageFromRemovals,
  setRemovalsPageComponent,
  isPageFullyRemoved,
  getPermissionBarRole,
  getPermissionBarStyle,
} from '../../utils/addUserModalPermissionHelpers';

export interface AdditionalPermissionsEditorProps {
  permissionOverrides: RolePermissions | null;
  setPermissionOverrides: Dispatch<SetStateAction<RolePermissions | null>>;
  permissionRemovals: RolePermissions | null;
  setPermissionRemovals: Dispatch<SetStateAction<RolePermissions | null>>;
  rolePermissions: RolePermissions | null;
}

export function AdditionalPermissionsEditor({
  permissionOverrides,
  setPermissionOverrides,
  permissionRemovals,
  setPermissionRemovals,
  rolePermissions,
}: Readonly<AdditionalPermissionsEditorProps>) {
  const customPages = permissionOverrides?.type === 'custom' ? permissionOverrides.pages : [];
  const removalPages = permissionRemovals?.type === 'custom' ? permissionRemovals.pages : [];
  const rolePages = rolePermissions?.type === 'custom' ? rolePermissions.pages : [];
  const roleHasAll = rolePermissions?.type === 'all';

  return (
    <div className="space-y-4 pl-6 border-l-2 border-gray-200 max-h-48 overflow-y-auto">
      {PERMISSION_PAGES.map((page) => {
        const overridePageChecked = hasPageInCustom(customPages, page.pageId);
        const roleHasPage = roleHasAll || hasPageInCustom(rolePages, page.pageId);
        const removalHasPage = hasPageInCustom(removalPages, page.pageId);
        const pageFullyRemoved = isPageFullyRemoved(removalPages, page.pageId);
        const pageChecked = (roleHasPage || overridePageChecked) && !pageFullyRemoved;

        const entry = getPageEntry(customPages, page.pageId);
        const roleGivesFullPage = roleHasAll || hasComponentAccess(rolePages, page.pageId, FULL_PAGE_COMPONENT_ID);
        const removalHasFullPage = hasComponentAccess(removalPages, page.pageId, FULL_PAGE_COMPONENT_ID);
        const overrideGivesFullPage =
          overridePageChecked && (entry?.components == null || entry?.components?.includes(FULL_PAGE_COMPONENT_ID));
        const effectiveFullPageFromRole = roleGivesFullPage && !removalHasFullPage;
        const fullPageChecked = pageChecked && (effectiveFullPageFromRole || overrideGivesFullPage);

        const handlePageCheck = () => {
          if (removalHasPage) removePageFromRemovals(permissionRemovals, setPermissionRemovals, page.pageId);
          else setOverridesPageSelectAll(permissionOverrides, setPermissionOverrides, page.pageId, page.pageLabel, true);
        };
        const handlePageUncheck = () => {
          if (!roleHasPage && overridePageChecked) {
            setOverridesPageSelectAll(permissionOverrides, setPermissionOverrides, page.pageId, page.pageLabel, false);
          } else if (roleHasPage) {
            addPageToRemovals(permissionRemovals, setPermissionRemovals, page.pageId, page.pageLabel);
          }
        };

        const pageAddedOnly = overridePageChecked && !roleHasPage;
        const pageBarRole = getPermissionBarRole(roleHasPage, overridePageChecked || pageChecked);
        const pageBarClass = pageBarRole === 'none' ? 'flex items-center gap-2' : 'border-l-2 pl-2 flex items-center gap-2';
        const pageBarStyle = getPermissionBarStyle(pageBarRole);

        return (
          <div key={page.pageId} className="space-y-2">
            <div className={pageBarClass} style={pageBarStyle}>
              <input
                type="checkbox"
                id={`override-page-${page.pageId}`}
                checked={pageChecked}
                onChange={(e) => (e.target.checked ? handlePageCheck() : handlePageUncheck())}
                className="rounded border-gray-300"
                aria-label={pageAddedOnly ? `${page.pageLabel} (added for this user)` : `${page.pageLabel} (from role)`}
              />
              <label htmlFor={`override-page-${page.pageId}`} className="text-sm font-medium text-primary cursor-pointer">
                {page.pageLabel}
              </label>
            </div>
            {pageChecked && (
              <div className="pl-6 flex flex-wrap gap-x-4 gap-y-1">
                {page.components.map((comp) => {
                  const isFullPage = comp.id === FULL_PAGE_COMPONENT_ID;
                  const overrideChecked = hasComponentAccess(customPages, page.pageId, comp.id);
                  const roleHasComponent = roleHasAll || hasComponentAccess(rolePages, page.pageId, comp.id);
                  const removalHasComponent = hasComponentAccess(removalPages, page.pageId, comp.id);
                  const removalEntry = getPageEntry(removalPages, page.pageId);
                  const removalExplicitlyListsComponent = (removalEntry?.components?.includes(comp.id)) === true;
                  const checked = (roleHasComponent && !removalHasComponent) || overrideChecked;
                  const disabledByFullPage = !isFullPage && fullPageChecked;
                  const compAddedOnly = overrideChecked && !roleHasComponent;
                  const compBarRole = getPermissionBarRole(roleHasComponent, overrideChecked || checked);
                  const compBarClass = compBarRole === 'none' ? '' : 'border-l-2 pl-2';
                  const compBarStyle = getPermissionBarStyle(compBarRole);

                  const handleComponentCheck = () => {
                    if (removalHasComponent && removalExplicitlyListsComponent) {
                      setRemovalsPageComponent(setPermissionRemovals, page.pageId, page.pageLabel, comp.id, false);
                    } else {
                      setOverridesPageComponent(
                        permissionOverrides,
                        setPermissionOverrides,
                        page.pageId,
                        page.pageLabel,
                        comp.id,
                        true
                      );
                    }
                  };
                  const handleComponentUncheck = () => {
                    if (!roleHasComponent && overrideChecked) {
                      setOverridesPageComponent(
                        permissionOverrides,
                        setPermissionOverrides,
                        page.pageId,
                        page.pageLabel,
                        comp.id,
                        false
                      );
                    } else if (roleHasComponent) {
                      setRemovalsPageComponent(setPermissionRemovals, page.pageId, page.pageLabel, comp.id, true);
                      if (overrideChecked) {
                        setOverridesPageComponent(
                          permissionOverrides,
                          setPermissionOverrides,
                          page.pageId,
                          page.pageLabel,
                          comp.id,
                          false
                        );
                      }
                    }
                  };

                  return (
                    <div key={comp.id} className={compBarClass} style={compBarStyle}>
                      <label
                        className={`flex items-center gap-1.5 text-sm text-secondary ${disabledByFullPage ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabledByFullPage}
                          onChange={(e) => (e.target.checked ? handleComponentCheck() : handleComponentUncheck())}
                          className="rounded border-gray-300 disabled:opacity-70 disabled:cursor-not-allowed"
                          aria-label={compAddedOnly ? `${comp.label} (added for this user)` : `${comp.label} (from role)`}
                        />
                        <span>{comp.label}</span>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
