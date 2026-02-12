import { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { renderTimeViewClock } from '@mui/x-date-pickers/timeViewRenderers';
import { Spinner } from '../common/Spinner';
import { locationService } from '../../services/location.service';
import { TIMEZONE_OPTIONS } from '../../utils/timezones';
import type { Location } from '../../types';

export interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editLocation: Location | null;
}

const DEFAULT_BUSINESS_START_TIME = '04:00';

function parseBusinessStartToDate(hhmm: string): Date {
  const [h = '0', m = '0'] = hhmm.trim().split(':');
  const d = new Date();
  d.setHours(Number.parseInt(h, 10), Number.parseInt(m, 10), 0, 0);
  return d;
}

function formatBusinessStartFromDate(date: Date | null): string {
  if (!date) return DEFAULT_BUSINESS_START_TIME;
  return format(date, 'HH:mm');
}

export const LocationModal = ({ isOpen, onClose, onSaved, editLocation }: LocationModalProps) => {
  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [squareLocationId, setSquareLocationId] = useState('');
  const [homebaseLocationId, setHomebaseLocationId] = useState('');
  const [timezone, setTimezone] = useState('');
  const [businessStartTime, setBusinessStartTime] = useState(DEFAULT_BUSINESS_START_TIME);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const modalContentRef = useRef<HTMLDivElement>(null);
  const [pickerPaperWidth, setPickerPaperWidth] = useState(400);

  useEffect(() => {
    if (!isOpen || !modalContentRef.current) return;
    const el = modalContentRef.current;
    const updateWidth = () => setPickerPaperWidth(el.getBoundingClientRect().width);
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  const isEdit = Boolean(editLocation);
  const canSubmit =
    storeName.trim() !== '' &&
    address.trim() !== '' &&
    squareLocationId.trim() !== '' &&
    homebaseLocationId.trim() !== '' &&
    timezone.trim() !== '' &&
    businessStartTime.trim() !== '';

  const businessStartTimeDate = useMemo(
    () => parseBusinessStartToDate(businessStartTime),
    [businessStartTime],
  );

  useEffect(() => {
    if (editLocation) {
      setStoreName(editLocation.storeName);
      setAddress(editLocation.address);
      setSquareLocationId(editLocation.squareLocationId);
      setHomebaseLocationId(editLocation.homebaseLocationId ?? '');
      setTimezone(editLocation.timezone ?? '');
      setBusinessStartTime(editLocation.businessStartTime ?? DEFAULT_BUSINESS_START_TIME);
    } else {
      setStoreName('');
      setAddress('');
      setSquareLocationId('');
      setHomebaseLocationId('');
      setTimezone('');
      setBusinessStartTime(DEFAULT_BUSINESS_START_TIME);
    }
    setError('');
  }, [editLocation, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      if (isEdit && editLocation) {
        await locationService.update(editLocation._id, {
          storeName: storeName.trim(),
          address: address.trim(),
          squareLocationId: squareLocationId.trim(),
          homebaseLocationId: homebaseLocationId.trim(),
          timezone: timezone.trim(),
          businessStartTime: businessStartTime.trim(),
        });
      } else {
        await locationService.create({
          storeName: storeName.trim(),
          address: address.trim(),
          squareLocationId: squareLocationId.trim(),
          homebaseLocationId: homebaseLocationId.trim(),
          timezone: timezone.trim(),
          businessStartTime: businessStartTime.trim(),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const submitButtonLabel = isEdit ? 'Update' : 'Add Location';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div ref={modalContentRef} className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-card-background rounded-xl shadow-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-secondary mb-4">
          {isEdit ? 'Edit Location' : 'Add Location'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="storeName" className="block text-sm font-medium text-primary mb-1">
              Store name
            </label>
            <input
              id="storeName"
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
              placeholder="Store name"
            />
          </div>
          <div>
            <label htmlFor="address" className="block text-sm font-medium text-primary mb-1">
              Address
            </label>
            <input
              id="address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
              placeholder="Address"
            />
          </div>
          <div>
            <label htmlFor="squareLocationId" className="block text-sm font-medium text-primary mb-1">
              Square location ID
            </label>
            <input
              id="squareLocationId"
              type="text"
              value={squareLocationId}
              onChange={(e) => setSquareLocationId(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
              placeholder="Square location ID"
            />
          </div>
          <div>
            <label htmlFor="homebaseLocationId" className="block text-sm font-medium text-primary mb-1">
              Homebase location ID
            </label>
            <input
              id="homebaseLocationId"
              type="text"
              value={homebaseLocationId}
              onChange={(e) => setHomebaseLocationId(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
              placeholder="Homebase location ID"
            />
          </div>
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-primary mb-1">
              Timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg"
            >
              {TIMEZONE_OPTIONS.map((opt) => (
                <option key={opt.value || 'empty'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              Business start time
            </label>
            <div className="location-modal-time-picker">
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <TimePicker
                label=""
                value={businessStartTimeDate}
                onChange={(date) => setBusinessStartTime(formatBusinessStartFromDate(date))}
                viewRenderers={{
                  hours: renderTimeViewClock,
                  minutes: renderTimeViewClock,
                }}
                format="HH:mm"
                slotProps={{
                  desktopPaper: {
                    sx: { width: pickerPaperWidth, maxWidth: '100%', boxSizing: 'border-box' },
                  },
                }}
                sx={{
                  width: '100%',
                  '& .MuiPickersOutlinedInput-root, & .MuiOutlinedInput-root': {
                    borderRadius: '12px !important',
                    backgroundColor: '#F9F9F9 !important',
                    padding: '12px 16px',
                    minHeight: 48,
                    fontSize: '0.875rem !important',
                    color: '#5B6B79 !important',
                    fontFamily: 'Onest, sans-serif !important',
                    '& fieldset, & .MuiPickersOutlinedInput-notchedOutline': {
                      borderColor: '#DBDBDB !important',
                      borderRadius: '12px !important',
                    },
                    '&:hover fieldset, &:hover .MuiPickersOutlinedInput-notchedOutline': {
                      borderColor: '#DBDBDB !important',
                    },
                    '&.Mui-focused fieldset, &.Mui-focused .MuiPickersOutlinedInput-notchedOutline': {
                      borderColor: '#5B6B79 !important',
                      borderWidth: '1px !important',
                      borderRadius: '12px !important',
                    },
                    '& .MuiPickersSectionList-root, & .MuiPickersSectionList-section, & .MuiPickersSectionList-sectionContent, & [contenteditable="true"], & input': {
                      color: '#5B6B79 !important',
                      fontFamily: 'Onest, sans-serif !important',
                      fontSize: '0.875rem !important',
                    },
                  },
                }}
              />
            </LocalizationProvider>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Day runs from this time to 1 second before the same time next day.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-primary hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Spinner size="sm" className="h-4 w-4 text-white" />
                  {isEdit ? 'Updating...' : 'Saving...'}
                </>
              ) : (
                submitButtonLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
