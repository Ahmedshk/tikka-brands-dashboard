import React from 'react';
import type { ComponentType } from 'react';
import { parse } from 'date-fns';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import type { PickersDayProps } from '@mui/x-date-pickers/PickersDay';

function toMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function toDate(day: unknown): Date | null {
  if (day == null) return null;
  if (day instanceof Date) return day;
  if (typeof (day as { toJsDate?: () => Date }).toJsDate === 'function')
    return (day as { toJsDate: () => Date }).toJsDate();
  if (typeof (day as { getTime?: () => number }).getTime === 'function')
    return new Date((day as { getTime: () => number }).getTime());
  return null;
}

/** Parse ISO date (yyyy-MM-dd) to local midnight. */
export function parseISODateToLocal(iso: string | undefined): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const datePart = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const d = parse(datePart, 'yyyy-MM-dd', new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

const RANGE_BG = 'rgba(25, 118, 210, 0.15)';

function getRangeBorderRadius(
  isStart: boolean,
  isEnd: boolean,
): string {
  if (isStart && isEnd) return '50%';
  if (isStart) return '50% 0 0 50%';
  if (isEnd) return '0 50% 50% 0';
  return '0';
}

/** Custom day component that highlights start date, end date, and days in between. */
export function createRangeDay(
  rangeStart: Date,
  rangeEnd: Date,
): ComponentType<PickersDayProps<Date>> {
  const startTime = toMidnight(rangeStart);
  const endTime = toMidnight(rangeEnd);

  return function RangeDay(props: PickersDayProps<Date>) {
    const { day, sx, style, ...rest } = props;
    const dayDate = toDate(day);

    if (!dayDate) {
      return <PickersDay {...rest} day={day} sx={sx} style={style} />;
    }

    const dayTime = toMidnight(dayDate);
    const isStart = dayTime === startTime;
    const isEnd = dayTime === endTime;
    const isInRange = dayTime > startTime && dayTime < endTime;

    if (!isStart && !isEnd && !isInRange) {
      return <PickersDay {...rest} day={day} sx={sx} style={style} />;
    }

    const rangeStyle: React.CSSProperties = {
      backgroundColor: RANGE_BG,
      borderRadius: getRangeBorderRadius(isStart, isEnd),
      margin: 0,
    };

    if (isStart || isEnd) {
      rangeStyle.border = '2px solid rgba(25, 118, 210, 0.7)';
      rangeStyle.boxSizing = 'border-box';
    }

    return (
      <PickersDay
        {...rest}
        day={day}
        selected={false}
        disableMargin
        sx={sx}
        style={{ ...style, ...rangeStyle }}
      />
    );
  };
}
