import { useState, useRef, useEffect, useMemo } from "react";
import { format, parse } from "date-fns";
import Popover from "@mui/material/Popover";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import TextField from "@mui/material/TextField";
import { createRangeDay, parseISODateToLocal } from "../SalesTrend/rangeDaySlot";
import type { KitchenPerformancePeriodType, KitchenPerformancePeriodValue } from "../../utils/kitchenPerformancePeriodRange";
import { getMaxSelectableDateInTimezone, periodToDateRange } from "../../utils/kitchenPerformancePeriodRange";

const PERIOD_OPTIONS: { value: KitchenPerformancePeriodType; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "thisWeek", label: "This week" },
  { value: "lastWeek", label: "Last week" },
  { value: "custom", label: "Custom" },
];

const DATE_DISPLAY_FORMAT = "MM/dd/yy";

function isoYmdToDisplay(ymd: string): string {
  try {
    return format(parse(ymd, "yyyy-MM-dd", new Date()), DATE_DISPLAY_FORMAT);
  } catch {
    return "";
  }
}

export interface KitchenPerformancePeriodPickerProps {
  value: KitchenPerformancePeriodValue;
  onChange: (value: KitchenPerformancePeriodValue) => void;
  /** IANA timezone for max calendar date and preset resolution hints */
  timezone: string;
  id?: string;
  className?: string;
  /**
   * When true, the popover is not portaled to `document.body`.
   * Required inside native `<dialog>` (showModal), which uses the browser top layer above normal stacking.
   */
  disablePortal?: boolean;
}

function parseDateSafe(s: string | undefined): Date | null {
  if (!s) return null;
  const d = parse(s, DATE_DISPLAY_FORMAT, new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

function getDisplayRangeForPeriodType(
  periodType: KitchenPerformancePeriodType,
  timezone: string,
): { start: string; end: string } {
  const { startDate, endDate } = periodToDateRange({ periodType }, timezone);
  return { start: isoYmdToDisplay(startDate), end: isoYmdToDisplay(endDate) };
}

function formatDateToISO(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function isSameOrAfter(date: Date, start: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  return d >= s;
}

export function KitchenPerformancePeriodPicker({
  value,
  onChange,
  timezone,
  id,
  className = "",
  disablePortal = false,
}: Readonly<KitchenPerformancePeriodPickerProps>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [localStart, setLocalStart] = useState<string>("");
  const [localEnd, setLocalEnd] = useState<string>("");
  const calendarDateRef = useRef<Date>(new Date());
  const pickingRef = useRef<"start" | "end">("start");

  useEffect(() => {
    if (value.periodType === "custom" && pickingRef.current !== "end") {
      setLocalStart(value.periodStart ? isoYmdToDisplay(value.periodStart) : "");
      setLocalEnd(value.periodEnd ? isoYmdToDisplay(value.periodEnd) : "");
    }
  }, [value.periodType, value.periodStart, value.periodEnd]);

  const open = Boolean(anchorEl);
  const isCustom = value.periodType === "custom";

  const localStartDate = parseDateSafe(localStart);
  const localEndDate = parseDateSafe(localEnd);
  const isPicking = pickingRef.current === "end";
  const rangeStart = localStartDate ?? (isPicking ? null : parseISODateToLocal(value.periodStart));
  const rangeEnd = localEndDate ?? (isPicking ? null : parseISODateToLocal(value.periodEnd));
  const slots = useMemo(() => {
    if (rangeStart != null && rangeEnd != null) {
      return { day: createRangeDay(rangeStart, rangeEnd) };
    }
    if (rangeStart != null) {
      return { day: createRangeDay(rangeStart, rangeStart) };
    }
    return undefined;
  }, [rangeStart?.getTime(), rangeEnd?.getTime()]);

  const maxDate = useMemo(() => getMaxSelectableDateInTimezone(timezone), [timezone]);

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
    pickingRef.current = "start";
  };
  const handleClose = () => {
    setAnchorEl(null);
    pickingRef.current = "start";
    if (isCustom && localStart && localEnd) {
      const start = parseDateSafe(localStart);
      const end = parseDateSafe(localEnd);
      if (start && end) {
        onChange({
          periodType: "custom",
          periodStart: formatDateToISO(start),
          periodEnd: formatDateToISO(end),
        });
      }
    } else if (isCustom && localStart && !localEnd) {
      setLocalStart(value.periodStart ? isoYmdToDisplay(value.periodStart) : "");
      setLocalEnd(value.periodEnd ? isoYmdToDisplay(value.periodEnd) : "");
    }
  };

  const handleSelectPeriod = (periodType: KitchenPerformancePeriodType) => {
    if (periodType === "custom") {
      const start = parseDateSafe(localStart);
      const end = parseDateSafe(localEnd);
      onChange({
        periodType: "custom",
        periodStart: start ? formatDateToISO(start) : undefined,
        periodEnd: end ? formatDateToISO(end) : undefined,
      });
    } else {
      setLocalStart("");
      setLocalEnd("");
      pickingRef.current = "start";
      onChange({ periodType });
      setAnchorEl(null);
    }
  };

  const handleCalendarChange = (date: Date | null) => {
    if (!date) return;
    calendarDateRef.current = date;
    const str = format(date, DATE_DISPLAY_FORMAT);
    const dateIso = formatDateToISO(date);
    const currentStart = parseDateSafe(localStart);

    if (pickingRef.current === "start" || !currentStart) {
      setLocalStart(str);
      setLocalEnd("");
      pickingRef.current = "end";
      return;
    }

    if (isSameOrAfter(date, currentStart)) {
      setLocalEnd(str);
      pickingRef.current = "start";
      onChange({
        periodType: "custom",
        periodStart: formatDateToISO(currentStart),
        periodEnd: dateIso,
      });
      setAnchorEl(null);
    } else {
      setLocalStart(str);
      setLocalEnd("");
    }
  };

  const handleStartBlur = () => {
    const d = parseDateSafe(localStart);
    if (d) onChange({ ...value, periodStart: formatDateToISO(d) });
  };
  const handleEndBlur = () => {
    const d = parseDateSafe(localEnd);
    if (d) {
      onChange({ ...value, periodEnd: formatDateToISO(d) });
      if (parseDateSafe(localStart)) setAnchorEl(null);
    }
  };

  const displayLabel = (() => {
    if (value.periodType === "custom" && value.periodStart && value.periodEnd) {
      const s = isoYmdToDisplay(value.periodStart);
      const e = isoYmdToDisplay(value.periodEnd);
      if (!s || !e) return "Custom";
      return s === e ? s : `${s} – ${e}`;
    }
    return PERIOD_OPTIONS.find((o) => o.value === value.periodType)?.label ?? "Period";
  })();

  return (
    <>
      <button
        type="button"
        id={id}
        onClick={handleOpen}
        className={`border border-gray-300 rounded-lg px-3 py-2 text-sm text-primary bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-quaternary/30 ${className}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {displayLabel}
      </button>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        disablePortal={disablePortal}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: (theme) => ({
              zIndex: disablePortal ? 500 : undefined,
              width: "calc(100vw - 24px)",
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "calc(100vh - 24px)",
              overflow: "hidden",
              [theme.breakpoints.up("sm")]: {
                width: "auto",
                maxWidth: "none",
                maxHeight: "none",
                overflow: "visible",
              },
            }),
          },
        }}
      >
        <div className="flex flex-col sm:flex-row min-w-0">
          <div className="border-b border-gray-200 sm:border-b-0 sm:border-r shrink-0">
            <List
              dense
              sx={(theme) => ({
                py: 0,
                [theme.breakpoints.down("sm")]: {
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                },
              })}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <ListItemButton
                  key={opt.value}
                  selected={value.periodType === opt.value}
                  onClick={() => handleSelectPeriod(opt.value)}
                  sx={{
                    bgcolor: value.periodType === opt.value ? "action.selected" : undefined,
                  }}
                >
                  <ListItemText primary={opt.label} slotProps={{ primary: { style: { fontSize: 14 } } }} />
                </ListItemButton>
              ))}
            </List>
          </div>
          <div className="p-2 sm:p-3 flex flex-col gap-1 sm:gap-2 min-w-0 flex-1 justify-center items-center">
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <div className="w-full overflow-hidden flex justify-center max-h-[230px] sm:max-h-none">
                <div className="inline-block scale-[0.85] origin-top sm:scale-100 sm:origin-center">
                  <DateCalendar
                    value={
                      localEnd
                        ? parseDateSafe(localEnd) ?? calendarDateRef.current
                        : parseDateSafe(localStart) ?? calendarDateRef.current
                    }
                    onChange={handleCalendarChange}
                    minDate={new Date(2020, 0, 1)}
                    maxDate={maxDate}
                    slots={slots}
                    sx={(theme) => ({
                      [theme.breakpoints.down("sm")]: {
                        height: 240,
                      },
                    })}
                  />
                </div>
              </div>
            </LocalizationProvider>
            <div className="flex flex-row gap-2 w-full">
              {isCustom ? (
                <>
                  <TextField
                    size="small"
                    label="Start date"
                    value={localStart}
                    onChange={(e) => setLocalStart(e.target.value)}
                    onBlur={handleStartBlur}
                    placeholder={DATE_DISPLAY_FORMAT}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="End date"
                    value={localEnd}
                    onChange={(e) => setLocalEnd(e.target.value)}
                    onBlur={handleEndBlur}
                    placeholder={DATE_DISPLAY_FORMAT}
                    fullWidth
                  />
                </>
              ) : (
                (() => {
                  const { start, end } = getDisplayRangeForPeriodType(value.periodType, timezone);
                  return (
                    <>
                      <TextField
                        size="small"
                        label="Start date"
                        value={start}
                        slotProps={{ input: { readOnly: true } }}
                        fullWidth
                      />
                      <TextField
                        size="small"
                        label="End date"
                        value={end}
                        slotProps={{ input: { readOnly: true } }}
                        fullWidth
                      />
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      </Popover>
    </>
  );
}
