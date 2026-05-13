/**
 * Normalize JSON body from GET /locations/{uuid}/employees (several envelope shapes).
 */
export function parseHomebaseEmployeesJsonPayload(raw: unknown): unknown[] {
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
    const firstArray = Object.values(obj).find((v) => Array.isArray(v));
    if (firstArray) {
      return firstArray;
    }
  }
  return [];
}
