/** Square CatalogObject `version` from cached/API JSON (bigint | number | numeric string). */
export function catalogObjectVersionFromUnknown(
  versionRaw: unknown,
): number | undefined {
  if (typeof versionRaw === "bigint") {
    return Number(versionRaw);
  }
  if (typeof versionRaw === "number") {
    return versionRaw;
  }
  if (versionRaw != null) {
    return Number(versionRaw);
  }
  return undefined;
}
