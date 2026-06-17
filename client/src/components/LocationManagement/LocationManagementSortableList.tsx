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
import { CiImageOn } from 'react-icons/ci';
import { MdDragIndicator } from 'react-icons/md';
import EditIcon from '@assets/icons/edit.svg?react';
import DeleteIcon from '@assets/icons/delete.svg?react';
import type { LocationListItem } from '../../types';

type LocationManagementSortableListProps = {
  locations: LocationListItem[];
  onReorder: (next: LocationListItem[]) => void;
  onEdit: (loc: LocationListItem) => void;
  onDelete: (loc: LocationListItem) => void;
};

type SortableRowProps = {
  loc: LocationListItem;
  index: number;
  onEdit: (loc: LocationListItem) => void;
  onDelete: (loc: LocationListItem) => void;
};

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

function LocationLogo({ logoUrl }: Readonly<{ logoUrl?: string }>) {
  return (
    <span className="w-8 h-8 flex items-center justify-center shrink-0 text-gray-400">
      {logoUrl ? (
        <img src={logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain" />
      ) : (
        <CiImageOn className="w-5 h-5" aria-hidden />
      )}
    </span>
  );
}

function SortableMobileCard({ loc, index, onEdit, onDelete }: Readonly<SortableRowProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: loc._id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${cardBg} px-4 py-4 sm:px-5 sm:py-4 flex gap-3`}
    >
      <DragHandle attributes={attributes} listeners={listeners} />
      <div className="min-w-0 flex-1 flex flex-col gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-primary truncate" title={loc.storeName}>
            <LocationLogo logoUrl={loc.logoUrl} />
            <span className="truncate">{loc.storeName}</span>
          </p>
          {loc.address ? (
            <p className="text-xs text-gray-600 mt-1 line-clamp-2" title={loc.address}>
              {loc.address}
            </p>
          ) : null}
          <p className="text-xs text-gray-600 mt-1" title={loc.timezone}>
            <span className="font-medium">Timezone:</span> {loc.timezone}
          </p>
          <p className="text-xs text-gray-600">
            <span className="font-medium">Business start:</span> {loc.businessStartTime}
          </p>
        </div>
        <div className="flex items-center justify-end gap-0 sm:gap-2">
          <button
            type="button"
            onClick={() => onEdit(loc)}
            className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation"
            aria-label={`Edit ${loc.storeName}`}
            title={`Edit ${loc.storeName}`}
          >
            <EditIcon className="w-4 h-4 text-primary" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(loc)}
            className="p-2.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer touch-manipulation"
            aria-label={`Delete ${loc.storeName}`}
            title={`Delete ${loc.storeName}`}
          >
            <DeleteIcon className="w-4 h-4 text-primary" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableTableRow({ loc, index, onEdit, onDelete }: Readonly<SortableRowProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: loc._id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

  return (
    <tr ref={setNodeRef} style={style} className={rowBg}>
      <td className="px-2 lg:px-3 py-3 lg:py-4 w-12">
        <DragHandle attributes={attributes} listeners={listeners} />
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4">
        <div className="flex items-center gap-2 min-w-0">
          <LocationLogo logoUrl={loc.logoUrl} />
          <span className="text-xs 2xl:text-sm text-primary truncate" title={loc.storeName}>
            {loc.storeName}
          </span>
        </div>
      </td>
      <td
        className="px-4 lg:px-6 py-3 lg:py-4 text-xs 2xl:text-sm text-primary truncate"
        title={loc.address}
      >
        {loc.address}
      </td>
      <td
        className="px-4 lg:px-6 py-3 lg:py-4 text-xs 2xl:text-sm text-primary truncate"
        title={loc.timezone}
      >
        {loc.timezone}
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4 text-xs 2xl:text-sm text-primary whitespace-nowrap">
        {loc.businessStartTime}
      </td>
      <td className="px-4 lg:px-6 py-3 lg:py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(loc)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
            aria-label={`Edit ${loc.storeName}`}
            title={`Edit ${loc.storeName}`}
          >
            <EditIcon className="w-4 h-4 text-primary" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(loc)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
            aria-label={`Delete ${loc.storeName}`}
            title={`Delete ${loc.storeName}`}
          >
            <DeleteIcon className="w-4 h-4 text-primary" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export function LocationManagementSortableList({
  locations,
  onReorder,
  onEdit,
  onDelete,
}: Readonly<LocationManagementSortableListProps>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = locations.findIndex((l) => l._id === active.id);
    const newIndex = locations.findIndex((l) => l._id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(locations, oldIndex, newIndex));
  };

  const ids = locations.map((l) => l._id);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="md:hidden divide-y divide-gray-200">
          {locations.map((loc, index) => (
            <SortableMobileCard
              key={loc._id}
              loc={loc}
              index={index}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full table-fixed min-w-[40rem]">
            <thead>
              <tr className="bg-button-primary text-white">
                <th className="w-12 px-2 lg:px-3 py-3 lg:py-4" aria-label="Reorder" />
                <th className="w-[20%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Store name</th>
                <th className="w-[35%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Address</th>
                <th className="w-[22%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Timezone</th>
                <th className="w-[13%] text-left text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Business start time</th>
                <th className="text-right text-xs 2xl:text-sm font-semibold px-4 lg:px-6 py-3 lg:py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc, index) => (
                <SortableTableRow
                  key={loc._id}
                  loc={loc}
                  index={index}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      </SortableContext>
    </DndContext>
  );
}
