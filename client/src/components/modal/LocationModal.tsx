import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Location, Logo } from '../../types';
import { logoService } from '../../services/logo.service';
import {
  DEFAULT_BUSINESS_START_TIME,
  getLocationFormValidation,
  parseBusinessStartToDate,
  submitLocationForm,
  uploadPendingLogoAndGetId,
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
  const [squareWebhookSignatureKey, setSquareWebhookSignatureKey] = useState('');
  const [showSquareWebhookKey, setShowSquareWebhookKey] = useState(false);
  const [updateSquareCredentials, setUpdateSquareCredentials] = useState(false);
  const [updateHomebaseCredentials, setUpdateHomebaseCredentials] = useState(false);
  const [updateSquareWebhookSignature, setUpdateSquareWebhookSignature] = useState(false);
  const [selectedLogoId, setSelectedLogoId] = useState<string | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [logoList, setLogoList] = useState<Logo[]>([]);
  const [logoListLoading, setLogoListLoading] = useState(false);
  const [marketManBuyerGuid, setMarketManBuyerGuid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const modalContentRef = useRef<HTMLDivElement>(null);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pickerPopperContainer, setPickerPopperContainer] = useState<HTMLElement | null>(null);
  const [pickerModalPanel, setPickerModalPanel] = useState<HTMLElement | null>(null);
  const [pickerPaperWidth, setPickerPaperWidth] = useState(400);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const el = dialogRef.current;
    if (el && !el.open) el.showModal();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !modalPanelRef.current) return;
    const el = modalPanelRef.current;
    const updateWidth = () => setPickerPaperWidth(el.getBoundingClientRect().width);
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLogoListLoading(true);
    logoService.getList().then((logos) => {
      if (!cancelled) setLogoList(logos);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLogoListLoading(false);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  const isEdit = Boolean(editLocation);
  const hasStoredSquare = Boolean(editLocation?.hasSquareAccessToken);
  const hasStoredHomebase = Boolean(editLocation?.hasHomebaseApiKey);
  const hasStoredSquareWebhookSignature = Boolean(editLocation?.hasSquareWebhookSignatureKey);
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
      setSquareWebhookSignatureKey('');
      setShowSquareWebhookKey(false);
      setUpdateSquareCredentials(false);
      setUpdateHomebaseCredentials(false);
      setUpdateSquareWebhookSignature(false);
      setSelectedLogoId(editLocation.logoId ?? null);
      setPendingLogoFile(null);
      setLogoPreviewUrl(editLocation.logoUrl ?? null);
      setClearLogo(false);
      setMarketManBuyerGuid(editLocation.marketManBuyerGuid ?? '');
    } else {
      setStoreName('');
      setAddress('');
      setSquareLocationId('');
      setSquareAccessToken('');
      setHomebaseLocationId('');
      setHomebaseApiKey('');
      setSquareWebhookSignatureKey('');
      setShowSquareWebhookKey(false);
      setTimezone('');
      setBusinessStartTime(DEFAULT_BUSINESS_START_TIME);
      setUpdateSquareCredentials(false);
      setUpdateHomebaseCredentials(false);
      setUpdateSquareWebhookSignature(false);
      setSelectedLogoId(null);
      setPendingLogoFile(null);
      setLogoPreviewUrl(null);
      setClearLogo(false);
      setMarketManBuyerGuid('');
    }
    setError('');
  }, [editLocation, isOpen]);

  const handleNewLogoFile = useCallback((file: File) => {
    setSelectedLogoId(null);
    setPendingLogoFile(file);
    setLogoPreviewUrl(URL.createObjectURL(file));
    setClearLogo(false);
  }, []);

  const handleSelectLogo = useCallback((logo: Logo) => {
    setSelectedLogoId(logo._id);
    setPendingLogoFile(null);
    setLogoPreviewUrl(logo.url);
    setClearLogo(false);
  }, []);

  const handleClearLogo = useCallback(() => {
    setSelectedLogoId(null);
    setPendingLogoFile(null);
    setLogoPreviewUrl(null);
    setClearLogo(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      const resolvedLogoId = await uploadPendingLogoAndGetId(pendingLogoFile, selectedLogoId);

      if (pendingLogoFile && resolvedLogoId) {
        const uploaded = { _id: resolvedLogoId } as Logo;
        setLogoList((prev) => {
          if (prev.some((l) => l._id === resolvedLogoId)) return prev;
          return [uploaded, ...prev];
        });
      }

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
        hasStoredSquareWebhookSignature,
        updateSquareWebhookSignature,
        squareWebhookSignatureKey,
        logoId: resolvedLogoId,
        clearLogo,
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

  const setDialogEl = (el: HTMLDialogElement | null) => {
    dialogRef.current = el;
    setPickerPopperContainer(el);
  };

  return createPortal(
    <dialog
      ref={setDialogEl}
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
        <div
          ref={(el) => {
            modalPanelRef.current = el;
            setPickerModalPanel(el);
          }}
          className="relative max-h-[90vh] flex flex-col bg-card-background rounded-xl shadow-lg border-b border-gray-200 overflow-hidden"
        >
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
                pickerPopperContainer={pickerPopperContainer}
                pickerModalPanel={pickerModalPanel}
                selectedLogoId={selectedLogoId}
                logoPreviewUrl={logoPreviewUrl}
                logoList={logoList}
                logoListLoading={logoListLoading}
                onSelectLogo={handleSelectLogo}
                onNewLogoFile={handleNewLogoFile}
                onClearLogo={handleClearLogo}
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
                hasStoredSquareWebhookSignature={hasStoredSquareWebhookSignature}
                updateSquareWebhookSignature={updateSquareWebhookSignature}
                setUpdateSquareWebhookSignature={setUpdateSquareWebhookSignature}
                squareWebhookSignatureKey={squareWebhookSignatureKey}
                setSquareWebhookSignatureKey={setSquareWebhookSignatureKey}
                showSquareWebhookKey={showSquareWebhookKey}
                setShowSquareWebhookKey={setShowSquareWebhookKey}
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
