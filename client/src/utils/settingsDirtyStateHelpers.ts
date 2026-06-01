import type { CalendarRoleEventBindingDto } from "../types/calendar.types";

type UiBindingLike = CalendarRoleEventBindingDto & { key?: string };

function bindingPairKey(row: CalendarRoleEventBindingDto): string {
  return `${String(row.eventTypeId)}\0${String(row.roleId)}`;
}

/** Normalize bindings for compare/save (strip UI keys, dedupe pairs). */
export function normalizeCalendarBindingsForCompare(
  rows: UiBindingLike[],
): CalendarRoleEventBindingDto[] {
  const pairSeen = new Set<string>();
  const out: CalendarRoleEventBindingDto[] = [];
  for (const row of rows) {
    const { key: _k, ...rest } = row;
    const pair = bindingPairKey(rest);
    if (pairSeen.has(pair)) continue;
    pairSeen.add(pair);
    out.push({
      eventTypeId: rest.eventTypeId,
      roleId: rest.roleId,
      channels: { ...rest.channels },
      notifyOnStart: rest.notifyOnStart,
      notifyReminders: rest.notifyReminders,
    });
  }
  out.sort((a, b) => {
    const ak = bindingPairKey(a);
    const bk = bindingPairKey(b);
    return ak.localeCompare(bk);
  });
  return out;
}

export function calendarBindingsEqual(
  current: UiBindingLike[],
  saved: UiBindingLike[],
): boolean {
  return stableJsonEqual(
    normalizeCalendarBindingsForCompare(current),
    normalizeCalendarBindingsForCompare(saved),
  );
}

export function stableJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
