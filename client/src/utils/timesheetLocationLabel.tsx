import LocationIcon from "@assets/icons/location.svg?react";

/** Matches Activity Log “all locations” store line above each row title. */
export function TimesheetLocationLabel({ name }: Readonly<{ name: string }>) {
  return (
    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1 truncate min-w-0">
      <LocationIcon className="w-3 h-3 flex-shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </p>
  );
}

