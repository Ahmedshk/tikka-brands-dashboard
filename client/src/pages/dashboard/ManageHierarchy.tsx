import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { Layout } from '../../components/common/Layout';
import { HierarchyTree, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../../components/RBAC';
import type { HierarchyRoleItem, HierarchyTreeHandle } from '../../components/RBAC';
import type { RoleRow } from '../../types/rbac.types';
import { roleService } from '../../services/role.service';
import { Spinner } from '../../components/common/Spinner';
import { ConfirmDialog } from '../../components/modal/ConfirmDialog';
import AdminSettingsIcon from '@assets/icons/admin_and_settings.svg?react';
import toast from 'react-hot-toast';
import { FaArrowLeft, FaSearchPlus, FaSearchMinus, FaExpand, FaUndo } from 'react-icons/fa';

function buildInitialHierarchyMap(roles: RoleRow[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const ownerRole = roles.find((r) => r.isSystem);
  if (ownerRole?.id) {
    map.set(ownerRole.id, null);
  }
  for (const role of roles) {
    if (!role.id || role.isSystem) continue;
    if (role.reportsTo != null) {
      map.set(role.id, role.reportsTo);
    }
  }
  return map;
}

function mapsEqual(a: Map<string, string | null>, b: Map<string, string | null>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, val] of a) {
    if (b.get(key) !== val) return false;
    if (!b.has(key)) return false;
  }
  return true;
}

export const ManageHierarchy = () => {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hierarchyMap, setHierarchyMap] = useState<Map<string, string | null>>(new Map());
  const [savedMap, setSavedMap] = useState<Map<string, string | null>>(new Map());
  const [zoom, setZoom] = useState(1);
  const treeRef = useRef<HierarchyTreeHandle>(null);

  const zoomPercent = Math.round(zoom * 100);
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10));
  }, []);
  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10));
  }, []);
  const handleZoomReset = useCallback(() => setZoom(1), []);
  const handleFitToView = useCallback(() => treeRef.current?.fitToView(), []);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const list = await roleService.list(false);
      setRoles(list);
      const initial = buildInitialHierarchyMap(list);
      setHierarchyMap(initial);
      setSavedMap(initial);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load roles';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const isDirty = useMemo(() => !mapsEqual(hierarchyMap, savedMap), [hierarchyMap, savedMap]);

  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const hierarchyRoles: HierarchyRoleItem[] = useMemo(
    () =>
      roles
        .filter((r) => r.id != null && r.isActive !== false)
        .map((r) => ({
          id: r.id!,
          name: r.roleName,
          isSystem: r.isSystem === true,
        })),
    [roles]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const mappings: Array<{ roleId: string; reportsTo: string | null }> = [];
      for (const role of roles) {
        if (!role.id || role.isSystem) continue;
        const newParent = hierarchyMap.get(role.id);
        const isInTree = hierarchyMap.has(role.id);
        if (isInTree) {
          mappings.push({ roleId: role.id, reportsTo: newParent ?? null });
        } else if (role.reportsTo != null) {
          mappings.push({ roleId: role.id, reportsTo: null });
        }
      }
      await roleService.saveHierarchy(mappings);
      setSavedMap(new Map(hierarchyMap));
      toast.success('Hierarchy saved successfully.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save hierarchy';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 flex flex-col h-full">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard/rbac-management"
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors inline-flex"
              title="Back to RBAC Management"
            >
              <FaArrowLeft className="w-4 h-4 text-primary" />
            </Link>
            <h2 className="flex items-center gap-2 text-base md:text-lg 2xl:text-xl font-semibold text-primary">
              <AdminSettingsIcon className="w-4 h-4 md:w-5 md:h-5 2xl:w-6 2xl:h-6 text-primary" aria-hidden />
              Role Hierarchy
            </h2>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-xs md:text-sm 2xl:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save hierarchy"
          >
            {saving && <Spinner size="sm" className="text-white" />}
            {saving ? 'Saving…' : 'Save Hierarchy'}
          </button>
        </div>

        <p className="text-xs md:text-sm text-secondary mb-6 shrink-0">
          Build the reporting structure by adding roles as children of their supervisors. Drag and drop nodes to rearrange. Changes are saved when you click "Save Hierarchy".
        </p>

        {/* Tree area -- fills remaining page height */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4 text-primary">
            <Spinner size="xl" className="text-button-primary" />
            <span className="text-sm">Loading roles…</span>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Zoom controls */}
            <div className="flex items-center gap-1 mb-2 shrink-0">
              <div className="flex items-center gap-1 bg-card-background border border-gray-200 rounded-xl shadow-sm px-2 py-1.5">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= ZOOM_MIN}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Zoom out"
                >
                  <FaSearchMinus className="w-3.5 h-3.5 text-primary" />
                </button>
                <span className="text-xs font-medium text-secondary w-10 text-center tabular-nums select-none">
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom >= ZOOM_MAX}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Zoom in"
                >
                  <FaSearchPlus className="w-3.5 h-3.5 text-primary" />
                </button>
                <div className="w-px h-5 bg-gray-200 mx-0.5" />
                <button
                  type="button"
                  onClick={handleFitToView}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Fit to view"
                >
                  <FaExpand className="w-3.5 h-3.5 text-primary" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  disabled={zoom === 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Reset zoom (100%)"
                >
                  <FaUndo className="w-3 h-3 text-primary" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-card-background rounded-xl shadow border border-gray-200 overflow-auto cursor-grab touch-none">
              <HierarchyTree
                ref={treeRef}
                roles={hierarchyRoles}
                hierarchyMap={hierarchyMap}
                onHierarchyChange={setHierarchyMap}
                zoom={zoom}
                onZoomChange={setZoom}
              />
            </div>
          </div>
        )}
      </div>

      {/* Unsaved changes blocker */}
      <ConfirmDialog
        isOpen={blocker.state === 'blocked'}
        onClose={() => {
          if (blocker.state === 'blocked') blocker.reset();
        }}
        title="Unsaved changes"
        message="You have unsaved hierarchy changes. Are you sure you want to leave? Your changes will be lost."
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="danger"
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </Layout>
  );
};
