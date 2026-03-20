import { useState, useRef, useEffect } from "react";
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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set(selectedIds));

  useEffect(() => {
    if (isOpen) setTempSelected(new Set(selectedIds));
  }, [isOpen, selectedIds]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (dialogRef.current?.open) dialogRef.current.close();
    else onClose();
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
    if (dialogRef.current?.open) dialogRef.current.close();
    else onClose();
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      className="modal-full-viewport z-[300] m-0 bg-transparent border-0 p-4 outline-none hidden open:grid place-items-center [&::backdrop]:bg-black/50"
      aria-labelledby="add-roles-title"
    >
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-card-background shadow-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 id="add-roles-title" className="text-base font-semibold text-primary">{title}</h2>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <IoClose className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-2">
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

        <div className="flex gap-3 justify-end p-5 border-t border-gray-200">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-xs md:text-sm font-medium text-primary hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="px-4 py-2.5 bg-button-primary text-white rounded-xl text-xs md:text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            Add Roles
          </button>
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
