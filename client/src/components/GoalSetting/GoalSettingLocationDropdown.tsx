import React from 'react';
import { Dropdown } from '../common/Dropdown';
import { Spinner } from '../common/Spinner';
import LocationIcon from '@assets/icons/location.svg?react';
import type { Location } from '../../types';

export interface GoalSettingLocationDropdownProps {
  locations: Location[];
  locationsLoading: boolean;
  selectedLocation: Location | null;
  hasUnsavedChanges: boolean;
  onSelectLocation: (loc: Location) => void;
  onPendingLocation: (loc: Location) => void;
}

function getPlaceholder(locationsLoading: boolean, locations: Location[]): string {
  if (locationsLoading) return 'Loading...';
  if (locations.length === 0) return 'No locations';
  return 'Select location';
}

function TriggerLabel({
  locationsLoading,
  locations,
  selectedLocation,
}: Readonly<{
  locationsLoading: boolean;
  locations: Location[];
  selectedLocation: Location | null;
}>) {
  if (locationsLoading) {
    return (
      <>
        <Spinner size="sm" className="flex-shrink-0 text-button-primary" />
        <span className="text-sm md:text-base 2xl:text-lg font-semibold text-primary">Loading...</span>
      </>
    );
  }
  if (selectedLocation != null) {
    const title = selectedLocation.address
      ? `${selectedLocation.storeName} – ${selectedLocation.address}`
      : selectedLocation.storeName;
    return (
      <span
        className="font-semibold text-secondary text-sm md:text-base 2xl:text-lg truncate"
        title={title}
      >
        {selectedLocation.storeName}
      </span>
    );
  }
  if (locations.length === 0) {
    return <span className="text-sm text-primary">No locations</span>;
  }
  return <span className="text-sm text-secondary">Select location</span>;
}

export function GoalSettingLocationDropdown({
  locations,
  locationsLoading,
  selectedLocation,
  hasUnsavedChanges,
  onSelectLocation,
  onPendingLocation,
}: Readonly<GoalSettingLocationDropdownProps>) {
  return (
    <Dropdown
      options={locations.map((loc) => ({
        value: loc._id,
        label: loc.storeName,
        secondaryLabel: loc.address,
      }))}
      value={selectedLocation?._id ?? ''}
      onChange={(id) => {
        const loc = locations.find((l) => l._id === id);
        if (loc == null) return;
        if (hasUnsavedChanges) {
          onPendingLocation(loc);
        } else {
          onSelectLocation(loc);
        }
      }}
      placeholder={getPlaceholder(locationsLoading, locations)}
      aria-label="Select location"
      className="w-full"
      allowEmpty={false}
      disabled={locationsLoading}
      triggerLabel={
        <span className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <LocationIcon className="w-4 h-4 md:w-4.5 md:h-4.5 2xl:w-5 2xl:h-5 flex-shrink-0 text-primary" />
          <TriggerLabel
            locationsLoading={locationsLoading}
            locations={locations}
            selectedLocation={selectedLocation}
          />
        </span>
      }
    />
  );
}
