import { Dropdown } from './Dropdown';
import type { DropdownOption } from './Dropdown';

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  options: FilterSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  'aria-label': string;
  className?: string;
  /** When true, dropdown opens above the trigger (e.g. in modals). Default false. */
  openAbove?: boolean;
}

export function FilterSelect({
  options,
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  className = '',
  openAbove = false,
}: FilterSelectProps) {
  const dropdownOptions: DropdownOption[] = options.map((o) => ({ value: o.value, label: o.label }));
  return (
    <Dropdown
      options={dropdownOptions}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={className}
      openAbove={openAbove}
      allowEmpty={true}
    />
  );
}
