import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Location, Logo } from '../../types';
import {
  DEFAULT_BUSINESS_START_TIME,
  getLocationFormValidation,
  parseBusinessStartToDate,
  submitLocationForm,
} from '../../utils/locationModalHelpers';
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
    <div className="modal-full-viewport z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div ref={modalContentRef} className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-card-background rounded-xl shadow-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-secondary mb-6">
          {isEdit ? 'Edit Location' : 'Add Location'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-8">
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
          />
        </form>
      </div>
    </div>,
    document.body
  );
};
