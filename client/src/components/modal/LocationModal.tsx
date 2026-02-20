import { useState, useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { renderTimeViewClock } from '@mui/x-date-pickers/timeViewRenderers';
import { Spinner } from '../common/Spinner';
import { locationService } from '../../services/location.service';
import { logoService } from '../../services/logo.service';
import { TIMEZONE_OPTIONS } from '../../utils/timezones';
import type { Location, Logo } from '../../types';

export interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after save. For updates, receives the updated location so the parent can merge it into state. */
  onSaved: (updatedLocation?: Location) => void;
  editLocation: Location | null;
}

const DEFAULT_BUSINESS_START_TIME = '04:00';
const MASKED_CREDENTIAL_PLACEHOLDER = '••••••••••••••••••••';

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
  const [squareAccessToken, setSquareAccessToken] = useState('');
  const [homebaseLocationId, setHomebaseLocationId] = useState('');
  const [homebaseApiKey, setHomebaseApiKey] = useState('');
  const [timezone, setTimezone] = useState('');
  const [businessStartTime, setBusinessStartTime] = useState(DEFAULT_BUSINESS_START_TIME);
  const [showSquareToken, setShowSquareToken] = useState(false);
  const [showHomebaseKey, setShowHomebaseKey] = useState(false);
  const [updateSquareCredentials, setUpdateSquareCredentials] = useState(false);
  const [updateHomebaseCredentials, setUpdateHomebaseCredentials] = useState(false);
  const [logoId, setLogoId] = useState<string | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [marketManBuyerGuid, setMarketManBuyerGuid] = useState('');
  const [logoList, setLogoList] = useState<Logo[]>([]);
  const [logoListOpen, setLogoListOpen] = useState(false);
  const [logoListLoading, setLogoListLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const modalContentRef = useRef<HTMLDivElement>(null);
  const [pickerPaperWidth, setPickerPaperWidth] = useState(400);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const hasStoredSquare = Boolean(editLocation?.hasSquareAccessToken);
  const hasStoredHomebase = Boolean(editLocation?.hasHomebaseApiKey);
  const squareCredsOk =
    !isEdit ||
    (!hasStoredSquare && squareAccessToken.trim() !== '') ||
    (hasStoredSquare && !updateSquareCredentials) ||
    (updateSquareCredentials && squareAccessToken.trim() !== '');
  const homebaseCredsOk =
    !isEdit ||
    (!hasStoredHomebase && homebaseApiKey.trim() !== '') ||
    (hasStoredHomebase && !updateHomebaseCredentials) ||
    (updateHomebaseCredentials && homebaseApiKey.trim() !== '');
  const canSubmit =
    storeName.trim() !== '' &&
    address.trim() !== '' &&
    squareLocationId.trim() !== '' &&
    homebaseLocationId.trim() !== '' &&
    timezone.trim() !== '' &&
    businessStartTime.trim() !== '' &&
    marketManBuyerGuid.trim() !== '' &&
    squareCredsOk &&
    homebaseCredsOk;

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
      setSquareAccessToken('');
      setHomebaseApiKey('');
      setUpdateSquareCredentials(false);
      setUpdateHomebaseCredentials(false);
      setLogoId(editLocation.logoId ?? null);
      setLogoDataUrl(editLocation.logoDataUrl ?? null);
      setMarketManBuyerGuid(editLocation.marketManBuyerGuid ?? '');
    } else {
      setStoreName('');
      setAddress('');
      setSquareLocationId('');
      setSquareAccessToken('');
      setHomebaseLocationId('');
      setHomebaseApiKey('');
      setTimezone('');
      setBusinessStartTime(DEFAULT_BUSINESS_START_TIME);
      setUpdateSquareCredentials(false);
      setUpdateHomebaseCredentials(false);
      setLogoId(null);
      setLogoDataUrl(null);
      setMarketManBuyerGuid('');
    }
    setLogoListOpen(false);
    setError('');
  }, [editLocation, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      if (isEdit && editLocation) {
        const updatePayload = {
          storeName: storeName.trim(),
          address: address.trim(),
          squareLocationId: squareLocationId.trim(),
          homebaseLocationId: homebaseLocationId.trim(),
          timezone: timezone.trim(),
          businessStartTime: businessStartTime.trim(),
          ...(logoId !== null && logoId !== '' ? { logoId } : { logoId: null }),
          marketManBuyerGuid: marketManBuyerGuid.trim(),
          // Send credentials when user entered them: either replacing (Update clicked) or setting for first time (no stored creds)
          ...((updateSquareCredentials || !hasStoredSquare) && squareAccessToken.trim() && { squareAccessToken: squareAccessToken.trim() }),
          ...((updateHomebaseCredentials || !hasStoredHomebase) && homebaseApiKey.trim() && { homebaseApiKey: homebaseApiKey.trim() }),
        };
        const updated = await locationService.update(editLocation._id, updatePayload);
        onSaved(updated);
      } else {
        await locationService.create({
          storeName: storeName.trim(),
          address: address.trim(),
          squareLocationId: squareLocationId.trim(),
          homebaseLocationId: homebaseLocationId.trim(),
          timezone: timezone.trim(),
          businessStartTime: businessStartTime.trim(),
          squareAccessToken: squareAccessToken.trim(),
          homebaseApiKey: homebaseApiKey.trim(),
          marketManBuyerGuid: marketManBuyerGuid.trim(),
          ...(logoId ? { logoId } : {}),
        });
        onSaved();
      }
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
        <h3 className="text-lg font-semibold text-secondary mb-6">
          {isEdit ? 'Edit Location' : 'Add Location'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">
              {error}
            </p>
          )}

          <section className="space-y-4 pt-6 border-t border-gray-200 first:border-t-0 first:pt-0">
            <h4 className="text-base font-semibold text-primary border-l-4 border-button-primary pl-3 py-1">
              General
            </h4>
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
              <span id="businessStartTime-label" className="block text-sm font-medium text-primary mb-1">
                Business start time
              </span>
            <div className="location-modal-time-picker" aria-labelledby="businessStartTime-label">
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
          </section>

          <section className="space-y-4 pt-6 border-t border-gray-200">
            <h4 className="text-base font-semibold text-primary border-l-4 border-button-primary pl-3 py-1">
              Store logo
            </h4>
            <p className="text-xs text-gray-500">Optional. Used in the sidebar when this location is selected. Default logo is used if none is set.</p>
            {logoDataUrl && (
              <div className="flex items-center gap-3">
                <img src={logoDataUrl} alt="Store logo" className="h-14 w-auto max-w-[140px] object-contain border border-gray-200 rounded-lg bg-white" />
                <button
                  type="button"
                  onClick={() => { setLogoId(null); setLogoDataUrl(null); }}
                  className="text-sm text-red-600 hover:underline"
                >
                  Clear logo
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!logoListOpen) {
                    setLogoListLoading(true);
                    try {
                      const list = await logoService.getList();
                      setLogoList(list);
                    } catch {
                      setError('Failed to load logos');
                    } finally {
                      setLogoListLoading(false);
                    }
                  }
                  setLogoListOpen(!logoListOpen);
                }}
                disabled={logoListLoading}
                className="px-3 py-2 text-sm font-medium border border-gray-200 rounded-xl text-primary hover:bg-gray-50 transition-colors disabled:opacity-70"
              >
                {logoListLoading ? 'Loading...' : logoListOpen ? 'Hide logos' : 'Pick from existing'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                className="px-3 py-2 text-sm font-medium border border-button-primary text-button-primary rounded-xl hover:bg-button-primary/5 transition-colors disabled:opacity-70"
              >
                {logoUploading ? 'Uploading...' : 'Upload new'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !file.type.startsWith('image/')) return;
                  e.target.value = '';
                  setLogoUploading(true);
                  setError('');
                  try {
                    const dataUrl = await new Promise<string>((resolve, reject) => {
                      const r = new FileReader();
                      r.onload = () => resolve(r.result as string);
                      r.onerror = reject;
                      r.readAsDataURL(file);
                    });
                    const logo = await logoService.create(dataUrl);
                    setLogoId(logo._id);
                    setLogoDataUrl(logo.dataUrl);
                    setLogoList((prev) => [logo, ...prev]);
                    setLogoListOpen(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to upload logo');
                  } finally {
                    setLogoUploading(false);
                  }
                }}
              />
            </div>
            {logoListOpen && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-xl bg-gray-50">
                {logoList.length === 0 && !logoListLoading ? (
                  <p className="col-span-full text-sm text-gray-500 py-2">No logos yet. Upload one above.</p>
                ) : (
                  logoList.map((logo) => (
                    <button
                      key={logo._id}
                      type="button"
                      onClick={() => {
                        setLogoId(logo._id);
                        setLogoDataUrl(logo.dataUrl);
                        setLogoListOpen(false);
                      }}
                      className={`p-1 rounded-lg border-2 transition-colors ${logoId === logo._id ? 'border-button-primary bg-white' : 'border-transparent hover:border-gray-300 bg-white'}`}
                    >
                      <img src={logo.dataUrl} alt="" className="w-full h-12 object-contain" />
                    </button>
                  ))
                )}
              </div>
            )}
          </section>

          <section className="space-y-4 pt-6 border-t border-gray-200">
            <h4 className="text-base font-semibold text-primary border-l-4 border-button-primary pl-3 py-1">
              MarketMan
            </h4>
            <div>
              <label htmlFor="marketManBuyerGuid" className="block text-sm font-medium text-primary mb-1">
                MarketMan Buyer GUID
              </label>
              <input
                id="marketManBuyerGuid"
                type="text"
                value={marketManBuyerGuid}
                onChange={(e) => setMarketManBuyerGuid(e.target.value)}
                className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
                placeholder="MarketMan Buyer GUID (optional)"
              />
            </div>
          </section>

          <section className="space-y-4 pt-6 border-t border-gray-200">
            <h4 className="text-base font-semibold text-primary border-l-4 border-button-primary pl-3 py-1">
              Square
            </h4>
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
              <label htmlFor="squareAccessToken" className="block text-sm font-medium text-primary mb-1">
                Square access token
              </label>
              {isEdit && hasStoredSquare && !updateSquareCredentials ? (
                <div className="flex gap-2 items-center">
                  <input
                    id="squareAccessToken"
                    type="text"
                    value={MASKED_CREDENTIAL_PLACEHOLDER}
                    readOnly
                    disabled
                    className="flex-1 px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => setUpdateSquareCredentials(true)}
                    className="shrink-0 px-3 py-2 text-sm font-medium text-button-primary border border-button-primary rounded-xl hover:bg-button-primary/5 transition-colors"
                  >
                    Update
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    id="squareAccessToken"
                    type={showSquareToken ? 'text' : 'password'}
                    value={squareAccessToken}
                    onChange={(e) => setSquareAccessToken(e.target.value)}
                    required={!isEdit || !hasStoredSquare}
                    autoComplete="off"
                    className="w-full px-4 py-3 pr-14 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
                    placeholder={isEdit && hasStoredSquare ? 'Enter new token to replace' : 'Square access token'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSquareToken((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 ml-1"
                    aria-label={showSquareToken ? 'Hide token' : 'Show token'}
                  >
                    {showSquareToken ? 'Hide' : 'Show'}
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 pt-6 border-t border-gray-200">
            <h4 className="text-base font-semibold text-primary border-l-4 border-button-primary pl-3 py-1">
              Homebase
            </h4>
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
              <label htmlFor="homebaseApiKey" className="block text-sm font-medium text-primary mb-1">
                Homebase API key
              </label>
              {isEdit && hasStoredHomebase && !updateHomebaseCredentials ? (
                <div className="flex gap-2 items-center">
                  <input
                    id="homebaseApiKey"
                    type="text"
                    value={MASKED_CREDENTIAL_PLACEHOLDER}
                    readOnly
                    disabled
                    className="flex-1 px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => setUpdateHomebaseCredentials(true)}
                    className="shrink-0 px-3 py-2 text-sm font-medium text-button-primary border border-button-primary rounded-xl hover:bg-button-primary/5 transition-colors"
                  >
                    Update
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    id="homebaseApiKey"
                    type={showHomebaseKey ? 'text' : 'password'}
                    value={homebaseApiKey}
                    onChange={(e) => setHomebaseApiKey(e.target.value)}
                    required={!isEdit || !hasStoredHomebase}
                    autoComplete="off"
                    className="w-full px-4 py-3 pr-14 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
                    placeholder={isEdit && hasStoredHomebase ? 'Enter new API key to replace' : 'Homebase API key'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowHomebaseKey((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 ml-1"
                    aria-label={showHomebaseKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showHomebaseKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 pt-6 border-t border-gray-200">
            <h4 className="text-base font-semibold text-primary border-l-4 border-button-primary pl-3 py-1">
              MarketMan
            </h4>
            <div>
              <label htmlFor="marketManBuyerGuid" className="block text-sm font-medium text-primary mb-1">
                MarketMan buyer GUID
              </label>
              <input
                id="marketManBuyerGuid"
                type="text"
                value={marketManBuyerGuid}
                onChange={(e) => setMarketManBuyerGuid(e.target.value)}
                required
                className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
                placeholder="MarketMan buyer GUID"
              />
            </div>
          </section>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
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
