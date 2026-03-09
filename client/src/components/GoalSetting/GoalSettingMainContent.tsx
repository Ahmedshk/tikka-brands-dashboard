import React from 'react';

export interface GoalSettingMainContentProps {
  hasLocation: boolean;
  loading: boolean;
  children: React.ReactNode;
}

/**
 * Renders either "select location" message, "loading" message, or the form content.
 * Used to keep GoalSetting page complexity low.
 */
export function GoalSettingMainContent({
  hasLocation,
  loading,
  children,
}: Readonly<GoalSettingMainContentProps>) {
  if (!hasLocation) {
    return (
      <p className="text-primary">
        Select a location above to view and edit goals. Each location has its own goals.
      </p>
    );
  }
  if (loading) {
    return <p className="text-primary">Loading goals...</p>;
  }
  return <>{children}</>;
}
