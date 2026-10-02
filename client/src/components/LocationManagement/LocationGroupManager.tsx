import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MdDragIndicator } from 'react-icons/md';
import { ConfirmDialog } from '../modal/ConfirmDialog';
import { locationGroupService } from '../../services/locationGroup.service';
import { planGroupMembership } from '../../utils/locationGroupHelpers';
import type { LocationGroup, LocationListItem } from '../../types';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';

type LocationGroupManagerProps = {
  /** Groups with all members, from the management endpoint. */
  groups: LocationGroup[];
  /** All locations, for the member column's name lookup. */
  locations: LocationListItem[];
  /** Local reorder from a drag; not persisted until the page saves. */
  onReorder: (next: LocationGroup[]) => void;
  /**
   * Open the shared edit modal for one group. Creating is not wired here: the
   * page header owns the single "Add Group" button.
   */
  onRequestEdit: (group: LocationGroup) => void;
  /** Refresh the page-level location + group state after a mutation. */
  onChanged: () => void;
};

/** Trim a long member list for the table cell. */
function formatMembers(
  locations: LocationListItem[],
  memberIds: string[],
): { text: string; title: string } {
  if (memberIds.length === 0) return { text: 'No locations', title: '' };
  const names = memberIds
    .map((id) => locations.find((l) => l._id === id)?.storeName)
    .filter((n): n is string => Boolean(n));
  const title = names.join(', ');
  if (names.length <= 2) return { text: names.join(', '), title };
  return { text: `${names.slice(0, 2).join(', ')} +${names.length - 2} more`, title };
}

function DragHandle({ attributes, listeners }: Readonly<{
  attributes: ReturnType<typeof useSortable>['attributes'];
  listeners: ReturnType<typeof useSortable>['listeners'];
}>) {
  return (
    <button
      type="button"
      className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-grab active:cursor-grabbing touch-manipulation text-gray-500"
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <MdDragIndicator className="w-5 h-5" aria-hidden />
    </button>
  );
}

/**
 * Handle a group create/edit from the modal, applying the membership as a whole
 * set. Adding or removing a member affects only the group being edited.
 */
export async function applyGroupFormSubmission(args: {
  editGroup: LocationGroup | null;
  name: string;
  locationIds: string[];
}): Promise<void> {
  const { editGroup, name, locationIds } = args;

  if (editGroup == null) {
    const created = await locationGroupService.create(name);
    for (const id of locationIds) {
      await locationGroupService.assignLocation(id, created._id);
    }
    return;
  }

  if (name !== editGroup.name) {
    await locationGroupService.update(editGroup._id, name);
  }
  const { toAdd, toRelease } = planGroupMembership(editGroup.locationIds, locationIds);
  // Apply the membership diff without rewriting unchanged locations.
  for (const id of toAdd) {
    await locationGroupService.assignLocation(id, editGroup._id);
  }
  for (const id of toRelease) {
    await locationGroupService.assignLocation(id, editGroup._id, 'remove');
  }
}

type SortableGroupRowProps = {
  group: LocationGroup;
  index: number;
  locations: LocationListItem[];
  onRequestEdit: (group: LocationGroup) => void;
  onRequestDelete: (group: LocationGroup) => void;
};

function SortableTableRow({
  group,
  index,
  locations,
  onRequestEdit,
  onRequestDelete,
}: Readonly<SortableGroupRowProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group._id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const members = formatMembers(locations, group.locationIds);
  const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

  return (
    <tr ref={setNodeRef} style={style} className={rowBg}>
      <td className="px-2 lg:px-3 py-3 lg:py-4 w-12">
        <DragHandle attributes={attributes} listeners={listeners} />
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4 text-xs 2xl:text-sm font-medium text-primary">
        <span className="block truncate" title={group.name}>
          {group.name}
        </span>
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4 text-xs 2xl:text-sm text-primary">
        <span className="block truncate" title={members.title}>
          {members.text}
        </span>
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onRequestEdit(group)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
            aria-label={`Edit ${group.name}`}
            title={`Edit ${group.name}`}
          >
            <EditIcon className="w-4 h-4 text-primary" />
          </button>
          <button
            type="button"
            onClick={() => onRequestDelete(group)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
            aria-label={`Delete ${group.name}`}
            title={`Delete ${group.name}`}
          >
            <DeleteIcon className="w-4 h-4 text-primary" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SortableMobileCard({
  group,
  index,
  locations,
  onRequestEdit,
  onRequestDelete,
}: Readonly<SortableGroupRowProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group._id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const members = formatMembers(locations, group.locationIds);
  const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${cardBg} px-4 py-4 sm:px-5 sm:py-4 flex gap-3`}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary truncate" title={group.name}>
          {group.name}
        </p>
        <p className="text-xs text-gray-600 mt-1" title={members.title}>
          <span className="font-medium">Locations:</span> {members.text}
        </p>
        <div className="flex items-center justify-end gap-0 sm:gap-2 mt-2">
          <button
            type="button"
            onClick={() => onRequestEdit(group)}
            className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation"
            aria-label={`Edit ${group.name}`}
            title={`Edit ${group.name}`}
          >
            <EditIcon className="w-4 h-4 text-primary" />
          </button>
          <button
            type="button"
            onClick={() => onRequestDelete(group)}
            className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation"
            aria-label={`Delete ${group.name}`}
            title={`Delete ${group.name}`}
          >
            <DeleteIcon className="w-4 h-4 text-primary" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function LocationGroupManager({
  groups,
  locations,
  onReorder,
  onRequestEdit,
  onChanged,
}: Readonly<LocationGroupManagerProps>) {
  const [deleting, setDeleting] = useState<LocationGroup | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // 8px activation distance so a click on a row's buttons is never read as the
  // start of a drag — same thresholds as the locations list.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex((g) => g._id === active.id);
    const newIndex = groups.findIndex((g) => g._id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(groups, oldIndex, newIndex));
  };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      // Server removes this group's memberships while retaining other groups.
      await locationGroupService.delete(deleting._id);
      setDeleting(null);
      onChanged();
      toast.success('Location group deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete location group.');
    } finally {
      setDeletingBusy(false);
    }
  };

  const ids = groups.map((g) => g._id);

  const rowProps = (g: LocationGroup, index: number) => ({
    group: g,
    index,
    locations,
    onRequestEdit,
    onRequestDelete: setDeleting,
  });

  return (
    <>
      {groups.length === 0 ? (
        <div className="p-8 text-center text-primary">
          No location groups yet. Use Add Group to create one.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="md:hidden divide-y divide-gray-200">
              {groups.map((g, index) => (
                <SortableMobileCard key={g._id} {...rowProps(g, index)} />
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full table-fixed min-w-[40rem]">
                <thead>
                  <tr className="bg-button-primary text-white">
                    <th className="w-12 px-2 lg:px-3 py-3 lg:py-4" aria-label="Reorder" />
                    <th className="w-[30%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">
                      Group name
                    </th>
                    <th className="text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">
                      Locations
                    </th>
                    <th className="w-[20%] text-right text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, index) => (
                    <SortableTableRow key={g._id} {...rowProps(g, index)} />
                  ))}
                </tbody>
              </table>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {deleting != null ? (
        <ConfirmDialog
          isOpen
          onClose={() => setDeleting(null)}
          title="Delete location group"
          message={
            deleting.locationIds.length > 0
              ? `"${deleting.name}" has ${deleting.locationIds.length} location(s). Deleting it removes them from this group. They remain in their other groups, or become Ungrouped if they have no groups left.`
              : `Are you sure you want to delete "${deleting.name}"?`
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleConfirmDelete}
          variant="danger"
          isLoading={deletingBusy}
        />
      ) : null}
    </>
  );
}
