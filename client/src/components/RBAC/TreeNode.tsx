import { useState, useRef, useEffect } from 'react';
import { FaPlus, FaMinus, FaGripVertical } from 'react-icons/fa';

export interface TreeNodeData {
  roleId: string;
  roleName: string;
  isSystem: boolean;
  children: TreeNodeData[];
}

export interface DragState {
  draggedRoleId: string | null;
  draggedDescendantIds: Set<string>;
}

export interface TreeNodeProps {
  node: TreeNodeData;
  availableRoles: Array<{ id: string; name: string }>;
  onAddChild: (parentId: string, childRoleId: string) => void;
  onRemove: (roleId: string) => void;
  onDrop: (draggedRoleId: string, newParentId: string) => void;
  dragState: DragState;
  onDragStart: (roleId: string) => void;
  onDragEnd: () => void;
  onRequestRemoveConfirm: (roleId: string, roleName: string, descendantCount: number) => void;
  touchHoverRoleId?: string | null;
}

function collectDescendantCount(node: TreeNodeData): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + collectDescendantCount(child);
  }
  return count;
}

export function TreeNode({
  node,
  availableRoles,
  onAddChild,
  onRemove,
  onDrop,
  dragState,
  onDragStart,
  onDragEnd,
  onRequestRemoveConfirm,
  touchHoverRoleId,
}: Readonly<TreeNodeProps>) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isOwner = node.isSystem;
  const isDragging = dragState.draggedRoleId === node.roleId;
  const isInvalidTarget =
    dragState.draggedRoleId != null &&
    (dragState.draggedRoleId === node.roleId ||
      dragState.draggedDescendantIds.has(node.roleId));

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const handleDragStart = (e: React.DragEvent) => {
    if (isOwner) {
      e.preventDefault();
      return;
    }

    const cardEl = e.currentTarget as HTMLElement;
    const subtreeEl = cardEl.closest('.hierarchy-tree-node');
    if (subtreeEl) {
      const cardRect = cardEl.getBoundingClientRect();
      const subtreeRect = subtreeEl.getBoundingClientRect();
      e.dataTransfer.setDragImage(
        subtreeEl,
        cardRect.left + cardRect.width / 2 - subtreeRect.left,
        cardRect.top + cardRect.height / 2 - subtreeRect.top
      );
    }

    e.dataTransfer.setData('text/plain', node.roleId);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart(node.roleId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isInvalidTarget) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isInvalidTarget && dragState.draggedRoleId != null) {
      setIsOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsOver(false);
  };

  const handleDropEvent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && !isInvalidTarget) {
      onDrop(draggedId, node.roleId);
    }
  };

  const handleDragEnd = () => {
    setIsOver(false);
    onDragEnd();
  };

  const handleRemoveClick = () => {
    const descendantCount = collectDescendantCount(node);
    onRequestRemoveConfirm(node.roleId, node.roleName, descendantCount);
  };

  const isTouchHovered = touchHoverRoleId === node.roleId;
  const isHighlighted = isOver || isTouchHovered;

  let cardHighlight = '';
  if (isDragging) {
    cardHighlight = 'opacity-50';
  } else if (isHighlighted && !isInvalidTarget) {
    cardHighlight = 'ring-2 ring-blue-400 bg-blue-50';
  } else if (isHighlighted && isInvalidTarget) {
    cardHighlight = 'ring-2 ring-red-300';
  }

  return (
    <div className="hierarchy-tree-node flex flex-col items-center">
      {/* Node card */}
      <div
        role="treeitem"
        aria-selected={false}
        tabIndex={0}
        data-role-id={node.roleId}
        className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-card-background shadow-sm select-none transition-all ${cardHighlight} ${isOwner ? '' : 'cursor-grab active:cursor-grabbing'}`}
        draggable={!isOwner}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDropEvent}
        onDragEnd={handleDragEnd}
      >
        {!isOwner && (
          <FaGripVertical className="w-3 h-3 text-gray-400 shrink-0" />
        )}
        <span className="text-sm font-medium text-primary whitespace-nowrap">
          {node.roleName}
        </span>
        {isOwner && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-800">
            System
          </span>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-2">
          {/* Add child button */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              disabled={availableRoles.length === 0}
              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Add child role"
            >
              <FaPlus className="w-3 h-3" />
            </button>
            {dropdownOpen && availableRoles.length > 0 && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 w-48 max-h-52 overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-lg">
                {availableRoles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onAddChild(node.roleId, r.id);
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-gray-50 transition-colors"
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Remove button (non-owner only) */}
          {!isOwner && (
            <button
              type="button"
              onClick={handleRemoveClick}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
              title="Remove from hierarchy"
            >
              <FaMinus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Children */}
      {node.children.length > 0 && (
        <div className="hierarchy-tree-children flex flex-row items-start gap-0 mt-0 pt-0">
          {node.children.map((child) => (
            <div key={child.roleId} className="hierarchy-tree-child flex flex-col items-center">
              <TreeNode
                node={child}
                availableRoles={availableRoles}
                onAddChild={onAddChild}
                onRemove={onRemove}
                onDrop={onDrop}
                dragState={dragState}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onRequestRemoveConfirm={onRequestRemoveConfirm}
                touchHoverRoleId={touchHoverRoleId}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
