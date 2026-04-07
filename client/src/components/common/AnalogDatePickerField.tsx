import { forwardRef, useMemo, type SVGProps } from 'react';
import { format, isValid, parse } from 'date-fns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

/** Same horizontal centering as location modal pickers (Popper vs modal card). */
function locationModalPanelXAlignModifier(panelEl: HTMLElement) {
  return {
    name: 'locationModalPanelXAlign',
    enabled: true,
    phase: 'main' as const,
    requires: ['popperOffsets'] as string[],
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

function parseYmdToDate(ymd: string): Date | null {
  if (!ymd?.trim()) return null;
  const d = parse(ymd.trim(), 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : null;
}

/** Calendar outline for the open-picker control (matches stroke weight of prior chevron). */
const DatePickerCalendarIcon = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  function DatePickerCalendarIcon(props, ref) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden
        className="w-4 h-4 shrink-0"
        {...props}
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      </svg>
    );
  },
);

export interface AnalogDatePickerFieldProps {
  /** Stored as yyyy-MM-dd (API / zoned combine). */
  value: string;
  onChange: (ymd: string) => void;
  pickerPaperWidth: number;
  pickerPopperContainer?: HTMLElement | null;
  pickerModalPanel?: HTMLElement | null;
  labelledBy: string;
  /** Calendar cannot navigate / select dates before this (inclusive). */
  minDate?: Date;
}

export function AnalogDatePickerField({
  value,
  onChange,
  pickerPaperWidth,
  pickerPopperContainer,
  pickerModalPanel,
  labelledBy,
  minDate,
}: Readonly<AnalogDatePickerFieldProps>) {
  const valueDate = useMemo(() => parseYmdToDate(value), [value]);

  const popperModifiers = useMemo(
    () => (pickerModalPanel ? [locationModalPanelXAlignModifier(pickerModalPanel)] : []),
    [pickerModalPanel],
  );

  return (
    <div className="add-event-date-picker" aria-labelledby={labelledBy}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <DatePicker
          desktopModeMediaQuery="@media (min-width: 0px)"
          label=""
          format="MM/dd/yyyy"
          minDate={minDate}
          value={valueDate}
          slots={{ openPickerIcon: DatePickerCalendarIcon }}
          onChange={(date) => {
            if (date && isValid(date)) {
              onChange(format(date, 'yyyy-MM-dd'));
            } else {
              onChange('');
            }
          }}
          slotProps={{
            desktopPaper: {
              sx: { width: pickerPaperWidth, maxWidth: '100%', boxSizing: 'border-box' },
            },
            popper: {
              placement: 'bottom',
              ...(pickerPopperContainer ? { container: pickerPopperContainer } : {}),
              ...(popperModifiers.length > 0 ? { modifiers: popperModifiers } : {}),
            },
            openPickerButton: {
              sx: {
                p: '2px',
                mr: 0,
                alignSelf: 'center',
                color: '#6b7280',
                borderRadius: '0.375rem',
                '&:hover': { backgroundColor: 'transparent' },
              },
            },
            openPickerIcon: {
              sx: { width: 16, height: 16 },
            },
          }}
          sx={{
            width: '100%',
            '& .MuiPickersOutlinedInput-root, & .MuiOutlinedInput-root': {
              borderRadius: '0.5rem !important',
              backgroundColor: '#ffffff !important',
              alignItems: 'center',
              boxSizing: 'border-box',
              /* Taller than theoretical py-2 to match Dropdown button (UA / line-box often adds a few px). */
              minHeight: '42px !important',
              padding: '8px 12px !important',
              fontWeight: 400,
              fontSize: '0.75rem',
              lineHeight: '1rem',
              color: '#5B6B79 !important',
              '@media (min-width: 768px)': {
                fontSize: '0.875rem',
                lineHeight: '1.25rem',
                minHeight: '42px !important',
              },
              '@media (min-width: 1536px)': {
                fontSize: '1rem',
                lineHeight: '1.5rem',
                minHeight: '42px !important',
              },
              '& fieldset, & .MuiPickersOutlinedInput-notchedOutline': {
                borderColor: '#d1d5db !important',
                borderRadius: '0.5rem !important',
              },
              '&:hover fieldset, &:hover .MuiPickersOutlinedInput-notchedOutline': {
                borderColor: '#d1d5db !important',
              },
              '&.Mui-focused': {
                boxShadow: '0 0 0 2px rgba(209, 213, 219, 0.5)',
              },
              '&.Mui-focused fieldset, &.Mui-focused .MuiPickersOutlinedInput-notchedOutline': {
                borderColor: '#d1d5db !important',
                borderWidth: '1px !important',
                borderRadius: '0.5rem !important',
              },
            },
            '& .MuiPickersInputBase-sectionsContainer': {
              paddingTop: '0 !important',
              paddingBottom: '0 !important',
              minHeight: 0,
            },
            '& .MuiPickersSectionList-root': {
              padding: 0,
              minHeight: 0,
            },
            '& .MuiPickersSectionList-section, & .MuiPickersSectionList-sectionContent, & [contenteditable="true"], & input':
            {
              color: '#5B6B79 !important',
              fontWeight: 400,
              fontSize: 'inherit',
              lineHeight: 'inherit',
              paddingTop: 0,
              paddingBottom: 0,
            },
          }}
        />
      </LocalizationProvider>
    </div>
  );
}
