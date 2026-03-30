import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Location, Logo } from '../../types';
import {
  DEFAULT_BUSINESS_START_TIME,
  getLocationFormValidation,
  parseBusinessStartToDate,
  submitLocationForm,
} from '../../utils/locationModalHelpers';
import { Spinner } from '../common/Spinner';
import { LocationModalFormBody } from './LocationModalFormBody';

export interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after save. For updates, receives the updated location so the parent can merge it into state. */
  onSaved: (updatedLocation?: Location) => void;
  editLocation: Location | null;
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pickerPaperWidth, setPickerPaperWidth] = useState(400);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, [isOpen]);

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
  const { canSubmit } = getLocationFormValidation({
    isEdit,
    hasStoredSquare,
    hasStoredHomebase,
    storeName,
    address,
    squareLocationId,
    homebaseLocationId,
    timezone,
    businessStartTime,
    marketManBuyerGuid,
    squareAccessToken,
    homebaseApiKey,
    updateSquareCredentials,
    updateHomebaseCredentials,
  });

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
      const updated = await submitLocationForm({
        isEdit,
        editLocation,
        hasStoredSquare,
        hasStoredHomebase,
        storeName,
        address,
        squareLocationId,
        homebaseLocationId,
        timezone,
        businessStartTime,
        marketManBuyerGuid,
        squareAccessToken,
        homebaseApiKey,
        updateSquareCredentials,
        updateHomebaseCredentials,
        logoId,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const submitButtonLabel = isEdit ? 'Update' : 'Add Location';

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-full-viewport z-[300] m-0 grid place-items-center border-0 bg-transparent p-4 outline-none [&::backdrop]:bg-black/50 [&::backdrop]:cursor-pointer"
      aria-labelledby="location-modal-title"
      onClose={onClose}
    >
      <div className="relative w-full min-w-0 max-w-full md:max-w-2xl">
        <button
          type="button"
          onClick={() => {
            dialogRef.current?.close();
            onClose();
          }}
          className="absolute -top-2 -right-2 md:-top-4 md:-right-4 z-[400] flex h-5 w-5 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close"
          title="Close"
        >
          <span className="text-lg md:text-xl 2xl:text-2xl leading-none">×</span>
        </button>
        <div className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden">
          <div className="relative w-full rounded-t-xl bg-primary px-5 py-3 flex-shrink-0">
            <h2 id="location-modal-title" className="text-sm md:text-base 2xl:text-lg font-semibold text-white">
              {isEdit ? 'Edit Location' : 'Add Location'}
            </h2>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div
              ref={modalContentRef}
              className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-4 space-y-8 border-x border-gray-200"
            >
              <LocationModalFormBody
                error={error}
                isEdit={isEdit}
                submitButtonLabel={submitButtonLabel}
                submitting={submitting}
                canSubmit={canSubmit}
                storeName={storeName}
                setStoreName={setStoreName}
                address={address}
                setAddress={setAddress}
                timezone={timezone}
                setTimezone={setTimezone}
                businessStartTime={businessStartTime}
                businessStartTimeDate={businessStartTimeDate}
                setBusinessStartTime={setBusinessStartTime}
                pickerPaperWidth={pickerPaperWidth}
                logoDataUrl={logoDataUrl}
                setLogoId={setLogoId}
                setLogoDataUrl={setLogoDataUrl}
                logoList={logoList}
                setLogoList={setLogoList}
                logoListOpen={logoListOpen}
                setLogoListOpen={setLogoListOpen}
                logoListLoading={logoListLoading}
                setLogoListLoading={setLogoListLoading}
                logoUploading={logoUploading}
                setLogoUploading={setLogoUploading}
                setError={setError}
                fileInputRef={fileInputRef}
                marketManBuyerGuid={marketManBuyerGuid}
                setMarketManBuyerGuid={setMarketManBuyerGuid}
                squareLocationId={squareLocationId}
                setSquareLocationId={setSquareLocationId}
                hasStoredSquare={hasStoredSquare}
                updateSquareCredentials={updateSquareCredentials}
                setUpdateSquareCredentials={setUpdateSquareCredentials}
                squareAccessToken={squareAccessToken}
                setSquareAccessToken={setSquareAccessToken}
                showSquareToken={showSquareToken}
                setShowSquareToken={setShowSquareToken}
                homebaseLocationId={homebaseLocationId}
                setHomebaseLocationId={setHomebaseLocationId}
                hasStoredHomebase={hasStoredHomebase}
                updateHomebaseCredentials={updateHomebaseCredentials}
                setUpdateHomebaseCredentials={setUpdateHomebaseCredentials}
                homebaseApiKey={homebaseApiKey}
                setHomebaseApiKey={setHomebaseApiKey}
                showHomebaseKey={showHomebaseKey}
                setShowHomebaseKey={setShowHomebaseKey}
                logoId={logoId}
                onClose={onClose}
                showFormActions={false}
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex flex-wrap justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  dialogRef.current?.close();
                  onClose();
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-primary hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="px-4 py-2 rounded-lg bg-button-primary text-white font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
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
          </form>
        </div>
      </div>
    </dialog>,
    document.body
  );
};
