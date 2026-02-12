/** Common IANA timezones for location dropdown (US/Canada + UTC). */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Select timezone' },
  { value: 'America/New_York', label: 'Eastern Time (America/New_York)' },
  { value: 'America/Chicago', label: 'Central Time (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain Time (America/Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (America/Los_Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (America/Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Pacific/Honolulu)' },
  { value: 'America/Toronto', label: 'Eastern - Toronto (America/Toronto)' },
  { value: 'America/Vancouver', label: 'Pacific - Vancouver (America/Vancouver)' },
  { value: 'UTC', label: 'UTC' },
];
