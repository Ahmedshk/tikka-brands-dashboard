import { useMemo } from "react";
import { format } from "date-fns";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { renderTimeViewClock } from "@mui/x-date-pickers/timeViewRenderers";
import { parseBusinessStartToDate } from "../../utils/locationModalHelpers";

/** Same horizontal centering as location modal TimePicker (Popper vs modal card). */
function locationModalPanelXAlignModifier(panelEl: HTMLElement) {
  return {
    name: "locationModalPanelXAlign",
    enabled: true,
    phase: "main" as const,
    requires: ["popperOffsets"] as const,
    fn({
      state,
    }: {
      state: {
        rects: { reference: { x: number; width: number } };
        modifiersData: { popperOffsets?: { x: number; y: number } };
      };
    }) {
      const panel = panelEl.getBoundingClientRect();
      const ref = state.rects.reference;
      const modalCenterX = panel.left + panel.width / 2;
      const refCenterX = ref.x + ref.width / 2;
      const shift = modalCenterX - refCenterX;
      const o = state.modifiersData.popperOffsets;
      if (o) o.x += shift;
    },
  };
}

function formatHmFromDate(date: Date | null, fallback: string): string {
  if (!date) return fallback;
  return format(date, "HH:mm");
}

export interface AnalogTimePickerFieldProps {
  /** Stored as HH:mm (24h). */
  value: string;
  onChange: (hhmm: string) => void;
  /** When value is missing or invalid. */
  fallbackTime?: string;
  pickerPaperWidth: number;
  /** Portal host so the clock sits above stacked modal layers (e.g. fixed overlay). */
  pickerPopperContainer?: HTMLElement | null;
  /** Modal card element — centers the popover horizontally. */
  pickerModalPanel?: HTMLElement | null;
  labelledBy: string;
}

export function AnalogTimePickerField({
  value,
  onChange,
  fallbackTime = "09:00",
  pickerPaperWidth,
  pickerPopperContainer,
  pickerModalPanel,
  labelledBy,
}: Readonly<AnalogTimePickerFieldProps>) {
  const hm = value?.length === 5 ? value : fallbackTime;
  const valueDate = useMemo(() => parseBusinessStartToDate(hm), [hm]);

  const popperModifiers = useMemo(
    () => (pickerModalPanel ? [locationModalPanelXAlignModifier(pickerModalPanel)] : []),
    [pickerModalPanel],
  );

  return (
    <div className="location-modal-time-picker" aria-labelledby={labelledBy}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <TimePicker
          desktopModeMediaQuery="@media (min-width: 0px)"
          label=""
          value={valueDate}
          onChange={(date) => onChange(formatHmFromDate(date, fallbackTime))}
          viewRenderers={{
            hours: renderTimeViewClock,
            minutes: renderTimeViewClock,
          }}
          format="HH:mm"
          slotProps={{
            desktopPaper: {
              sx: { width: pickerPaperWidth, maxWidth: "100%", boxSizing: "border-box" },
            },
            popper: {
              placement: "bottom",
              ...(pickerPopperContainer ? { container: pickerPopperContainer } : {}),
              ...(popperModifiers.length > 0 ? { modifiers: popperModifiers } : {}),
            },
          }}
          sx={{
            width: "100%",
            "& .MuiPickersOutlinedInput-root, & .MuiOutlinedInput-root": {
              borderRadius: "12px !important",
              backgroundColor: "#F9F9F9 !important",
              padding: "12px 16px",
              minHeight: 48,
              fontSize: "0.875rem !important",
              color: "#5B6B79 !important",
              fontFamily: "Onest, sans-serif !important",
              "& fieldset, & .MuiPickersOutlinedInput-notchedOutline": {
                borderColor: "#DBDBDB !important",
                borderRadius: "12px !important",
              },
              "&:hover fieldset, &:hover .MuiPickersOutlinedInput-notchedOutline": {
                borderColor: "#DBDBDB !important",
              },
              "&.Mui-focused fieldset, &.Mui-focused .MuiPickersOutlinedInput-notchedOutline": {
                borderColor: "#5B6B79 !important",
                borderWidth: "1px !important",
                borderRadius: "12px !important",
              },
              "& .MuiPickersSectionList-root, & .MuiPickersSectionList-section, & .MuiPickersSectionList-sectionContent, & [contenteditable=\"true\"], & input": {
                color: "#5B6B79 !important",
                fontFamily: "Onest, sans-serif !important",
                fontSize: "0.875rem !important",
              },
            },
          }}
        />
      </LocalizationProvider>
    </div>
  );
}
