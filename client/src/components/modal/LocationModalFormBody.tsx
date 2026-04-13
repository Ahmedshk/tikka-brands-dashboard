import { useMemo } from 'react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import { renderTimeViewClock } from '@mui/x-date-pickers/timeViewRenderers';
import type { Logo } from '../../types';
import { Spinner } from '../common/Spinner';
import { TIMEZONE_OPTIONS } from '../../utils/timezones';
import {
  MASKED_CREDENTIAL_PLACEHOLDER,
  formatBusinessStartFromDate,
} from '../../utils/locationModalHelpers';

/** MUI anchors the picker to the inner input; shift horizontally so the popover centers on the modal card. */
function locationModalPanelXAlignModifier(panelEl: HTMLElement) {
  return {
    name: 'locationModalPanelXAlign',
    enabled: true,
    phase: 'main' as const,
    requires: ['popperOffsets'] as const,
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
  /** When false, the value is optional (e.g. Square webhook signature key). */
  credentialRequired?: boolean;
}>) {
  const {
    isEdit,
    hasStored,
    updateCredentials,
    onUpdateClick,
    value,
    onChange,
    showValue,
    onToggleShow,
    placeholder,
    inputId,
    label,
    credentialRequired = true,
  } = props;
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
        required={credentialRequired && (!isEdit || !hasStored)}
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
  /** Portal target for TimePicker Popper so it renders above native modal backdrop */
  pickerPopperContainer?: HTMLElement | null;
  /** Modal card element — used to center the time picker popover horizontally */
  pickerModalPanel?: HTMLElement | null;
  selectedLogoId: string | null;
  logoPreviewUrl: string | null;
  logoList: Logo[];
  logoListLoading: boolean;
  onSelectLogo: (logo: Logo) => void;
  onNewLogoFile: (file: File) => void;
  onClearLogo: () => void;
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
  hasStoredSquareWebhookSignature: boolean;
  updateSquareWebhookSignature: boolean;
  setUpdateSquareWebhookSignature: (v: boolean) => void;
  squareWebhookSignatureKey: string;
  setSquareWebhookSignatureKey: (v: string) => void;
  showSquareWebhookKey: boolean;
  setShowSquareWebhookKey: (v: boolean | ((s: boolean) => boolean)) => void;
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
    pickerPopperContainer,
    pickerModalPanel,
    selectedLogoId,
    logoPreviewUrl,
    logoList,
    logoListLoading,
    onSelectLogo,
    onNewLogoFile,
    onClearLogo,
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
    hasStoredSquareWebhookSignature,
    updateSquareWebhookSignature,
    setUpdateSquareWebhookSignature,
    squareWebhookSignatureKey,
    setSquareWebhookSignatureKey,
    showSquareWebhookKey,
    setShowSquareWebhookKey,
    onClose,
    showFormActions = true,
  } = props;

  const locationModalPopperModifiers = useMemo(
    () => (pickerModalPanel ? [locationModalPanelXAlignModifier(pickerModalPanel)] : []),
    [pickerModalPanel],
  );

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file?.type.startsWith('image/')) return;
    e.target.value = '';
    onNewLogoFile(file);
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
                desktopModeMediaQuery="@media (min-width: 0px)"
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
                  popper: {
                    placement: 'bottom',
                    ...(pickerPopperContainer ? { container: pickerPopperContainer } : {}),
                    ...(locationModalPopperModifiers.length > 0 ? { modifiers: locationModalPopperModifiers } : {}),
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

        {logoPreviewUrl && (
          <div className="flex items-center gap-3">
            <img src={logoPreviewUrl} alt="Selected logo" className="h-14 w-auto max-w-[140px] object-contain border border-gray-200 rounded-lg bg-white" />
            <button
              type="button"
              onClick={onClearLogo}
              className="text-sm text-red-600 hover:underline"
            >
              Clear logo
            </button>
          </div>
        )}

        {logoListLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Spinner size="sm" className="h-4 w-4" /> Loading logos...
          </div>
        ) : logoList.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Pick from existing logos</p>
            <div className="flex flex-wrap gap-2">
              {logoList.map((logo) => (
                <button
                  key={logo._id}
                  type="button"
                  onClick={() => onSelectLogo(logo)}
                  className={`relative h-14 w-14 rounded-lg border-2 bg-white p-1 transition-colors ${
                    selectedLogoId === logo._id
                      ? 'border-button-primary ring-1 ring-button-primary'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                  title={logo.name ?? 'Logo'}
                >
                  <img
                    src={logo.url}
                    alt={logo.name ?? 'Logo'}
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 text-sm font-medium border border-button-primary text-button-primary rounded-xl hover:bg-button-primary/5 transition-colors inline-flex items-center gap-2"
          >
            Upload new logo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml,.svg"
            className="hidden"
            onChange={handleLogoFileChange}
          />
        </div>
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
        <div>
          <label htmlFor="squareWebhookSignatureKey" className="block text-sm font-medium text-primary mb-1">
            Square webhook signature key
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Optional. From each Square app&apos;s webhook subscription — used to verify POSTs to your API. Stored encrypted. Leave empty when updating to remove.
          </p>
          <SquareCredentialsField
            isEdit={isEdit}
            hasStored={hasStoredSquareWebhookSignature}
            updateCredentials={updateSquareWebhookSignature}
            onUpdateClick={() => setUpdateSquareWebhookSignature(true)}
            value={squareWebhookSignatureKey}
            onChange={setSquareWebhookSignatureKey}
            showValue={showSquareWebhookKey}
            onToggleShow={() => setShowSquareWebhookKey((s) => !s)}
            placeholder={
              isEdit && hasStoredSquareWebhookSignature
                ? 'Enter new key or leave empty to remove'
                : 'Signature key from Square Developer Dashboard'
            }
            inputId="squareWebhookSignatureKey"
            label="webhook key"
            credentialRequired={false}
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
