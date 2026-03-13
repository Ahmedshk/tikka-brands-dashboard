import { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { TreeNode, type DragState } from './TreeNode';
import { ConfirmDialog } from '../modal/ConfirmDialog';
import {
  ZOOM_MIN,
  ZOOM_MAX,
  buildTree,
  getDescendantIds,
  getRemoveConfirmMessage,
  type HierarchyRoleItem,
} from '../../utils/hierarchyTreeHelpers';
import { useHierarchyTreeInteractions } from './useHierarchyTreeInteractions';

export { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../../utils/hierarchyTreeHelpers';
export type { HierarchyRoleItem } from '../../utils/hierarchyTreeHelpers';

interface HierarchyTreeProps {
  roles: HierarchyRoleItem[];
  /** roleId -> reportsTo (null = top-level / not in tree) */
  hierarchyMap: Map<string, string | null>;
  onHierarchyChange: (next: Map<string, string | null>) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export interface HierarchyTreeHandle {
  fitToView: () => void;
}

export const HierarchyTree = forwardRef<HierarchyTreeHandle, Readonly<HierarchyTreeProps>>(
  function HierarchyTree({ roles, hierarchyMap, onHierarchyChange, zoom, onZoomChange }, ref) {
    const [dragState, setDragState] = useState<DragState>({
      draggedRoleId: null,
      draggedDescendantIds: new Set(),
    });
    const [confirmRemove, setConfirmRemove] = useState<{
      roleId: string;
      roleName: string;
      descendantCount: number;
    } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const treeContentRef = useRef<HTMLDivElement>(null);
    const [touchHoverRoleId, setTouchHoverRoleId] = useState<string | null>(null);

    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    const callbacksRef = useRef({
      zoomChange: onZoomChange,
      dragStart: (_roleId: string) => {},
      dragEnd: () => {},
      drop: (_draggedId: string, _targetId: string) => {},
    });

    useImperativeHandle(ref, () => ({
      fitToView() {
        const content = treeContentRef.current;
        const scrollParent = containerRef.current?.parentElement;
        if (!content || !scrollParent) return;

        const prevZoom = content.style.zoom;
        content.style.zoom = '1';
        const contentWidth = content.scrollWidth;
        const contentHeight = content.scrollHeight;
        content.style.zoom = prevZoom;

        const viewportWidth = scrollParent.clientWidth;
        const viewportHeight = scrollParent.clientHeight;

        if (contentWidth === 0 || contentHeight === 0) return;

        const scaleX = viewportWidth / contentWidth;
        const scaleY = viewportHeight / contentHeight;
        const fitted = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(scaleX, scaleY) * 0.9));
        onZoomChange(Math.round(fitted * 100) / 100);
      },
    }), [onZoomChange]);

    const tree = useMemo(() => buildTree(roles, hierarchyMap), [roles, hierarchyMap]);

    const hasCenteredRef = useRef(false);
    useEffect(() => {
      if (!tree) return;
      if (hasCenteredRef.current) return;
      hasCenteredRef.current = true;

      const scrollParent = containerRef.current?.parentElement;
      if (!scrollParent) return;
      const ownerEl = containerRef.current?.querySelector('.hierarchy-tree-node');
      if (!ownerEl) return;

      requestAnimationFrame(() => {
        const parentRect = scrollParent.getBoundingClientRect();
        const nodeRect = ownerEl.getBoundingClientRect();
        const nodeCenterInScroll =
          nodeRect.left + nodeRect.width / 2 - parentRect.left + scrollParent.scrollLeft;
        scrollParent.scrollLeft = Math.max(0, nodeCenterInScroll - parentRect.width / 2);
      });
    }, [tree]);

    const rolesInTree = useMemo(() => {
      const inTree = new Set<string>();
      for (const [roleId] of hierarchyMap) {
        inTree.add(roleId);
      }
      return inTree;
    }, [hierarchyMap]);

    const availableRoles = useMemo(
      () =>
        roles
          .filter((r) => !r.isSystem && !rolesInTree.has(r.id))
          .map((r) => ({ id: r.id, name: r.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      [roles, rolesInTree]
    );

    const handleAddChild = useCallback(
      (parentId: string, childRoleId: string) => {
        const next = new Map(hierarchyMap);
        next.set(childRoleId, parentId);
        onHierarchyChange(next);
      },
      [hierarchyMap, onHierarchyChange]
    );

    const handleRemove = useCallback(
      (roleId: string) => {
        const descendants = getDescendantIds(roleId, hierarchyMap);
        const next = new Map(hierarchyMap);
        next.delete(roleId);
        for (const id of descendants) {
          next.delete(id);
        }
        onHierarchyChange(next);
        setConfirmRemove(null);
      },
      [hierarchyMap, onHierarchyChange]
    );

    const handleDrop = useCallback(
      (draggedRoleId: string, newParentId: string) => {
        if (draggedRoleId === newParentId) return;
        const descendants = getDescendantIds(draggedRoleId, hierarchyMap);
        if (descendants.has(newParentId)) return;

        const next = new Map(hierarchyMap);
        next.set(draggedRoleId, newParentId);
        onHierarchyChange(next);
        setDragState({ draggedRoleId: null, draggedDescendantIds: new Set() });
      },
      [hierarchyMap, onHierarchyChange]
    );

    const handleDragStart = useCallback(
      (roleId: string) => {
        const descendants = getDescendantIds(roleId, hierarchyMap);
        setDragState({ draggedRoleId: roleId, draggedDescendantIds: descendants });
      },
      [hierarchyMap]
    );

    const handleDragEnd = useCallback(() => {
      setDragState({ draggedRoleId: null, draggedDescendantIds: new Set() });
    }, []);

    const handleRequestRemoveConfirm = useCallback(
      (roleId: string, roleName: string, descendantCount: number) => {
        setConfirmRemove({ roleId, roleName, descendantCount });
      },
      []
    );

    callbacksRef.current = {
      zoomChange: onZoomChange,
      dragStart: handleDragStart,
      dragEnd: handleDragEnd,
      drop: handleDrop,
    };

    useHierarchyTreeInteractions(containerRef, zoomRef, callbacksRef, setTouchHoverRoleId);

    if (!tree) {
      return (
        <p className="text-sm text-secondary text-center py-8">
          No Owner role found. Please create the Owner system role first.
        </p>
      );
    }

    return (
      <div ref={containerRef} className="hierarchy-tree-container relative">
        <div
          ref={treeContentRef}
          className="pb-12 pt-6 px-8"
          style={{ zoom, minWidth: `${100 / zoom}%` }}
        >
          <div className="w-fit mx-auto">
            <TreeNode
              node={tree}
              availableRoles={availableRoles}
              onAddChild={handleAddChild}
              onRemove={handleRemove}
              onDrop={handleDrop}
              dragState={dragState}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onRequestRemoveConfirm={handleRequestRemoveConfirm}
              touchHoverRoleId={touchHoverRoleId}
            />
          </div>
        </div>

        <ConfirmDialog
          isOpen={confirmRemove != null}
          onClose={() => setConfirmRemove(null)}
          title="Remove from Hierarchy"
          message={getRemoveConfirmMessage(confirmRemove)}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => {
            if (confirmRemove) handleRemove(confirmRemove.roleId);
          }}
        />
      </div>
    );
  }
);
