import { useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { IoClose } from "react-icons/io5";
import { FiPlus } from "react-icons/fi";

interface RoleOption {
  _id: string;
  name: string;
}

interface RoleMappingSectionProps {
  roles: RoleOption[];
  employeeRoleIds: string[];
  managerRoleIds: string[];
  directorRoleIds: string[];
  onEmployeeChange: (ids: string[]) => void;
  onManagerChange: (ids: string[]) => void;
  onDirectorChange: (ids: string[]) => void;
}

interface AddRolesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  roles: RoleOption[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
}

const AddRolesModal = ({ isOpen, onClose, title, roles, selectedIds, onConfirm }: AddRolesModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set(selectedIds));

  useEffect(() => {
    if (isOpen) setTempSelected(new Set(selectedIds));
  }, [isOpen, selectedIds]);

  useEffect(() => {
    if (!isOpen) return;
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, [isOpen]);

  const dismiss = () => {
    dialogRef.current?.close();
  };

  const toggleRole = (id: string) => {
    setTempSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    onConfirm(Array.from(tempSelected));
    dialogRef.current?.close();
  };

  if (!isOpen) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center border-0 bg-transparent p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-md">
        <button
          type="button"
          onClick={dismiss}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 id={titleId} className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              {title}
            </h2>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-4 border-x border-gray-200 space-y-2">
            {roles.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                No roles available. Create roles in RBAC Management first.
              </p>
            )}
            {roles.map((role) => (
              <label
                key={role._id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={tempSelected.has(role._id)}
                  onChange={() => toggleRole(role._id)}
                  className="w-4 h-4 rounded border-gray-300 text-button-primary focus:ring-button-primary/30"
                />
                <span className="text-sm text-primary">{role.name}</span>
              </label>
            ))}
          </div>
          <div className="px-5 py-4 border-t border-gray-200 flex flex-wrap justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={dismiss}
              className="px-4 py-2 rounded-lg border border-gray-300 text-primary hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg bg-button-primary text-white font-medium hover:opacity-90 transition-opacity"
            >
              Add Roles
            </button>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};

const RoleGroup = ({
  label,
  description,
  roles,
  selectedIds,
  onChange,
}: {
  label: string;
  description: string;
  roles: RoleOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const selectedRoles = roles.filter((r) => selectedIds.includes(r._id));

  const removeRole = (id: string) => {
    onChange(selectedIds.filter((r) => r !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="text-xs md:text-sm font-semibold text-primary">{label}</h4>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-button-primary text-white text-xs md:text-sm rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
        >
          <FiPlus className="w-3.5 h-3.5" />
          Add Roles
        </button>
      </div>

      <div className="flex flex-wrap gap-2 min-h-[36px]">
        {selectedRoles.map((role) => (
          <span
            key={role._id}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs md:text-sm bg-button-primary/10 text-button-primary border border-button-primary/20"
          >
            {role.name}
            <button
              type="button"
              onClick={() => removeRole(role._id)}
              className="p-0.5 rounded-full hover:bg-button-primary/20 transition-colors cursor-pointer"
              aria-label={`Remove ${role.name}`}
            >
              <IoClose className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        {selectedRoles.length === 0 && (
          <p className="text-xs text-gray-400 py-1.5">No roles assigned. Click "Add Roles" to select.</p>
        )}
      </div>

      <AddRolesModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Select ${label}`}
        roles={roles}
        selectedIds={selectedIds}
        onConfirm={(ids) => {
          onChange(ids);
          setModalOpen(false);
        }}
      />
    </div>
  );
};

export const RoleMappingSection = ({
  roles,
  employeeRoleIds,
  managerRoleIds,
  directorRoleIds,
  onEmployeeChange,
  onManagerChange,
  onDirectorChange,
}: RoleMappingSectionProps) => {
  return (
    <div className="space-y-6">
      <h3 className="text-sm md:text-base font-semibold text-primary">Role Mapping</h3>
      <RoleGroup
        label="Employee Roles"
        description="Roles that receive 90-day self-reviews"
        roles={roles}
        selectedIds={employeeRoleIds}
        onChange={onEmployeeChange}
      />
      <RoleGroup
        label="Manager Roles"
        description="Roles that review employees and conduct check-ins"
        roles={roles}
        selectedIds={managerRoleIds}
        onChange={onManagerChange}
      />
      <RoleGroup
        label="Director Roles"
        description="Roles that approve or reject reviews"
        roles={roles}
        selectedIds={directorRoleIds}
        onChange={onDirectorChange}
      />
    </div>
  );
};
