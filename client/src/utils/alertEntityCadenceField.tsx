import { Tooltip } from "@mui/material";
import { Dropdown } from "../components/common/Dropdown";
import type { AlertEntityCadenceDto } from "../types/alertNotification.types";
import { alertEntityCadenceOptions } from "./alertsNotificationsSettingsHelpers";

function InfoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-primary/70 shrink-0"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AlertEntityCadenceField({
  label,
  tooltip,
  episodeLabel,
  value,
  onChange,
}: {
  label: string;
  tooltip: string;
  episodeLabel: string;
  value: AlertEntityCadenceDto;
  onChange: (value: AlertEntityCadenceDto) => void;
}) {
  return (
    <div className="max-w-md">
      <p className="block text-[10px] md:text-xs text-secondary mb-1">
        <span className="inline-flex items-center gap-1">
          {label}
          <Tooltip title={tooltip} placement="top" arrow enterDelay={200}>
            <button
              type="button"
              className="inline-flex cursor-help p-0 border-0 bg-transparent"
              aria-label={`${label} info`}
            >
              <InfoIcon />
            </button>
          </Tooltip>
        </span>
      </p>
      <Dropdown
        options={alertEntityCadenceOptions(episodeLabel)}
        value={value}
        onChange={(v) => onChange(v as AlertEntityCadenceDto)}
        placeholder="Alert frequency"
        aria-label={label}
        allowEmpty={false}
      />
    </div>
  );
}
