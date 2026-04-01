/**
 * Calendar role bindings store per-channel booleans. Legacy rows and some bulk saves
 * end up with `{}` or all-false values, which would suppress all delivery. Schema default
 * is in-app on; mirror that when no channel is explicitly enabled.
 */
export function normalizeRoleBindingChannels(
  ch: Partial<{ inApp?: boolean; email?: boolean; sms?: boolean }> | undefined,
): { inApp: boolean; email: boolean; sms: boolean } {
  const inApp = ch?.inApp === true;
  const email = ch?.email === true;
  const sms = ch?.sms === true;
  if (!inApp && !email && !sms) {
    return { inApp: true, email: false, sms: false };
  }
  return { inApp, email, sms };
}
