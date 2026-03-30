import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { renderTimeViewClock } from '@mui/x-date-pickers/timeViewRenderers';
import { Spinner } from '../common/Spinner';
import { logoService } from '../../services/logo.service';
import { TIMEZONE_OPTIONS } from '../../utils/timezones';
import type { Logo } from '../../types';
import {
  MASKED_CREDENTIAL_PLACEHOLDER,
  formatBusinessStartFromDate,
  getLogoListButtonLabel,
} from '../../utils/locationModalHelpers';

function SquareCredentialsField(props: Readonly<{
  isEdit: boolean;
  hasStored: boolean;
  updateCredentials: boolean;
  onUpdateClick: () => void;
  value: string;
  onChange: (v: string) => void;
  showValue: boolean;
  onToggleShow: () => void;
  placeholder: string;
  inputId: string;
  label: string;
}>) {
  const { isEdit, hasStored, updateCredentials, onUpdateClick, value, onChange, showValue, onToggleShow, placeholder, inputId, label } = props;
  const showMasked = isEdit && hasStored && !updateCredentials;
  if (showMasked) {
    return (
      <div className="flex gap-2 items-center">
        <input
          id={inputId}
          type="text"
          value={MASKED_CREDENTIAL_PLACEHOLDER}
          readOnly
          disabled
          className="flex-1 px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg text-gray-500"
        />
        <button
          type="button"
          onClick={onUpdateClick}
          className="shrink-0 px-3 py-2 text-sm font-medium text-button-primary border border-button-primary rounded-xl hover:bg-button-primary/5 transition-colors"
        >
          Update
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        id={inputId}
        type={showValue ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={!isEdit || !hasStored}
        autoComplete="off"
        className="w-full px-4 py-3 pr-14 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 ml-1"
        aria-label={showValue ? `Hide ${label}` : `Show ${label}`}
        title={showValue ? `Hide ${label}` : `Show ${label}`}
      >
        {showValue ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function HomebaseCredentialsField(props: Readonly<{
  isEdit: boolean;
  hasStored: boolean;
  updateCredentials: boolean;
  onUpdateClick: () => void;
  value: string;
  onChange: (v: string) => void;
  showValue: boolean;
  onToggleShow: () => void;
  placeholder: string;
  inputId: string;
  label: string;
}>) {
  const { isEdit, hasStored, updateCredentials, onUpdateClick, value, onChange, showValue, onToggleShow, placeholder, inputId, label } = props;
  const showMasked = isEdit && hasStored && !updateCredentials;
  if (showMasked) {
    return (
      <div className="flex gap-2 items-center">
        <input
          id={inputId}
          type="text"
          value={MASKED_CREDENTIAL_PLACEHOLDER}
          readOnly
          disabled
          className="flex-1 px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg text-gray-500"
        />
        <button
          type="button"
          onClick={onUpdateClick}
          className="shrink-0 px-3 py-2 text-sm font-medium text-button-primary border border-button-primary rounded-xl hover:bg-button-primary/5 transition-colors"
          title={`Update ${label}`}
        >
          Update
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        id={inputId}
        type={showValue ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={!isEdit || !hasStored}
        autoComplete="off"
        className="w-full px-4 py-3 pr-14 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 ml-1"
        aria-label={showValue ? `Hide ${label}` : `Show ${label}`}
        title={showValue ? `Hide ${label}` : `Show ${label}`}
      >
        {showValue ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export interface LocationModalFormBodyProps {
  error: string;
  isEdit: boolean;
  submitButtonLabel: string;
  submitting: boolean;
  canSubmit: boolean;
  storeName: string;
  setStoreName: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  businessStartTime: string;
  businessStartTimeDate: Date;
  setBusinessStartTime: (v: string) => void;
  pickerPaperWidth: number;
  logoDataUrl: string | null;
  setLogoId: (v: string | null) => void;
  setLogoDataUrl: (v: string | null) => void;
  logoList: Logo[];
  setLogoList: React.Dispatch<React.SetStateAction<Logo[]>>;
  logoListOpen: boolean;
  setLogoListOpen: (v: boolean) => void;
  logoListLoading: boolean;
  setLogoListLoading: (v: boolean) => void;
  logoUploading: boolean;
  setLogoUploading: (v: boolean) => void;
  setError: (v: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  marketManBuyerGuid: string;
  setMarketManBuyerGuid: (v: string) => void;
  squareLocationId: string;
  setSquareLocationId: (v: string) => void;
  hasStoredSquare: boolean;
  updateSquareCredentials: boolean;
  setUpdateSquareCredentials: (v: boolean) => void;
  squareAccessToken: string;
  setSquareAccessToken: (v: string) => void;
  showSquareToken: boolean;
  setShowSquareToken: (v: boolean | ((s: boolean) => boolean)) => void;
  homebaseLocationId: string;
  setHomebaseLocationId: (v: string) => void;
  hasStoredHomebase: boolean;
  updateHomebaseCredentials: boolean;
  setUpdateHomebaseCredentials: (v: boolean) => void;
  homebaseApiKey: string;
  setHomebaseApiKey: (v: string) => void;
  showHomebaseKey: boolean;
  setShowHomebaseKey: (v: boolean | ((s: boolean) => boolean)) => void;
  logoId: string | null;
  onClose: () => void;
  /** When false, Cancel/Submit are omitted so the parent can render a modal footer (e.g. dialog shell). */
  showFormActions?: boolean;
}

export function LocationModalFormBody(props: Readonly<LocationModalFormBodyProps>) {
  const {
    error,
    isEdit,
    submitButtonLabel,
    submitting,
    canSubmit,
    storeName,
    setStoreName,
    address,
    setAddress,
    timezone,
    setTimezone,
    businessStartTimeDate,
    setBusinessStartTime,
    pickerPaperWidth,
    logoDataUrl,
    setLogoId,
    setLogoDataUrl,
    logoList,
    setLogoList,
    logoListOpen,
    setLogoListOpen,
    logoListLoading,
    setLogoListLoading,
    logoUploading,
    setLogoUploading,
    setError,
    fileInputRef,
    marketManBuyerGuid,
    setMarketManBuyerGuid,
    squareLocationId,
    setSquareLocationId,
    hasStoredSquare,
    updateSquareCredentials,
    setUpdateSquareCredentials,
    squareAccessToken,
    setSquareAccessToken,
    showSquareToken,
    setShowSquareToken,
    homebaseLocationId,
    setHomebaseLocationId,
    hasStoredHomebase,
    updateHomebaseCredentials,
    setUpdateHomebaseCredentials,
    homebaseApiKey,
    setHomebaseApiKey,
    showHomebaseKey,
    setShowHomebaseKey,
    logoId,
    onClose,
    showFormActions = true,
  } = props;

  const handleLogoListToggle = async () => {
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
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith('image/')) return;
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
  };

  return (
    <>
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
            onClick={handleLogoListToggle}
            disabled={logoListLoading}
            className="px-3 py-2 text-sm font-medium border border-gray-200 rounded-xl text-primary hover:bg-gray-50 transition-colors disabled:opacity-70"
          >
            {getLogoListButtonLabel(logoListLoading, logoListOpen)}
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
            onChange={handleLogoFileChange}
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
          <SquareCredentialsField
            isEdit={isEdit}
            hasStored={hasStoredSquare}
            updateCredentials={updateSquareCredentials}
            onUpdateClick={() => setUpdateSquareCredentials(true)}
            value={squareAccessToken}
            onChange={setSquareAccessToken}
            showValue={showSquareToken}
            onToggleShow={() => setShowSquareToken((s) => !s)}
            placeholder={isEdit && hasStoredSquare ? 'Enter new token to replace' : 'Square access token'}
            inputId="squareAccessToken"
            label="token"
          />
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
          <HomebaseCredentialsField
            isEdit={isEdit}
            hasStored={hasStoredHomebase}
            updateCredentials={updateHomebaseCredentials}
            onUpdateClick={() => setUpdateHomebaseCredentials(true)}
            value={homebaseApiKey}
            onChange={setHomebaseApiKey}
            showValue={showHomebaseKey}
            onToggleShow={() => setShowHomebaseKey((s) => !s)}
            placeholder={isEdit && hasStoredHomebase ? 'Enter new API key to replace' : 'Homebase API key'}
            inputId="homebaseApiKey"
            label="API key"
          />
        </div>
      </section>

      <section className="space-y-4 pt-6 border-t border-gray-200">
        <h4 className="text-base font-semibold text-primary border-l-4 border-button-primary pl-3 py-1">
          MarketMan
        </h4>
        <div>
          <label htmlFor="marketManBuyerGuidFooter" className="block text-sm font-medium text-primary mb-1">
            MarketMan buyer GUID
          </label>
          <input
            id="marketManBuyerGuidFooter"
            type="text"
            value={marketManBuyerGuid}
            onChange={(e) => setMarketManBuyerGuid(e.target.value)}
            required
            className="w-full px-4 py-3 bg-[#F9F9F9] border border-[#DBDBDB] rounded-xl text-sm md:text-base 2xl:text-lg placeholder:text-sm md:placeholder:text-base 2xl:placeholder:text-lg"
            placeholder="MarketMan buyer GUID"
          />
        </div>
      </section>

      {showFormActions && (
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-primary hover:bg-gray-50 transition-colors cursor-pointer"
            title="Cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-button-primary text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
            title={isEdit ? 'Update location' : 'Save location'}
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
      )}
    </>
  );
}
