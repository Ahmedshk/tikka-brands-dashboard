/**
 * Normalize JSON body from GET /locations/{uuid}/employees (several envelope shapes).
 */
export function parseHomebaseEmployeesJsonPayload(raw: unknown, strict = false): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      return obj.data;
    }
    if (Array.isArray(obj.employees)) {
      return obj.employees;
    }
    if (strict) throw new Error("Unrecognized Homebase employees response; salary history was not changed");
    const firstArray = Object.values(obj).find((v) => Array.isArray(v));
    if (firstArray) {
      return firstArray;
    }
  }
  if (strict) throw new Error("Invalid Homebase employees response; salary history was not changed");
  return [];
}
