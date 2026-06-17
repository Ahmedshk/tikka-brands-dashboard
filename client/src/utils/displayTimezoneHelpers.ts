/** Mountain Time (DST-aware) when viewing all locations. */
export const ALL_LOCATIONS_DISPLAY_TIMEZONE = 'America/Denver';

export function resolveDisplayTimezone(
  isMultiLocationView: boolean,
  locationTimezone: string | undefined,
  fallback = ALL_LOCATIONS_DISPLAY_TIMEZONE,
): string {
  if (isMultiLocationView) return ALL_LOCATIONS_DISPLAY_TIMEZONE;
  return locationTimezone?.trim() || fallback;
}
