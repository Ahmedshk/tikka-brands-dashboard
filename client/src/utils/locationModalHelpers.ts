import { format } from 'date-fns';
import { locationService } from '../services/location.service';
import { logoService } from '../services/logo.service';
import type { Location } from '../types';

export const DEFAULT_BUSINESS_START_TIME = '04:00';
export const MASKED_CREDENTIAL_PLACEHOLDER = '••••••••••••••••••••';

export function parseBusinessStartToDate(hhmm: string): Date {
  const [h = '0', m = '0'] = hhmm.trim().split(':');
  const d = new Date();
  d.setHours(Number.parseInt(h, 10), Number.parseInt(m, 10), 0, 0);
  return d;
}

export function formatBusinessStartFromDate(date: Date | null): string {
  if (!date) return DEFAULT_BUSINESS_START_TIME;
  return format(date, 'HH:mm');
}

export function getLocationFormValidation(params: {
  isEdit: boolean;
  hasStoredSquare: boolean;
  hasStoredHomebase: boolean;
  storeName: string;
  address: string;
  squareLocationId: string;
  homebaseLocationId: string;
  timezone: string;
  businessStartTime: string;
  marketManBuyerGuid: string;
  googleBusinessAccountId: string;
  googleBusinessLocationId: string;
  squareAccessToken: string;
  homebaseApiKey: string;
  updateSquareCredentials: boolean;
  updateHomebaseCredentials: boolean;
}) {
  const {
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
  } = params;
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
  return { squareCredsOk, homebaseCredsOk, canSubmit };
}

/**
 * If a pending file is present, uploads it via the Logo API and returns the new logo ID.
 * Otherwise returns the already-selected logo ID (or null).
 */
export async function uploadPendingLogoAndGetId(
  pendingFile: File | null,
  selectedLogoId: string | null,
): Promise<string | null> {
  if (pendingFile) {
    const logo = await logoService.create(pendingFile);
    return logo._id;
  }
  return selectedLogoId;
}

export async function submitLocationForm(params: {
  isEdit: boolean;
  editLocation: Location | null;
  hasStoredSquare: boolean;
  hasStoredHomebase: boolean;
  storeName: string;
  address: string;
  squareLocationId: string;
  homebaseLocationId: string;
  timezone: string;
  businessStartTime: string;
  marketManBuyerGuid: string;
  googleBusinessAccountId: string;
  googleBusinessLocationId: string;
  squareAccessToken: string;
  homebaseApiKey: string;
  updateSquareCredentials: boolean;
  updateHomebaseCredentials: boolean;
  hasStoredSquareWebhookSignature: boolean;
  updateSquareWebhookSignature: boolean;
  squareWebhookSignatureKey: string;
  logoId: string | null;
  clearLogo: boolean;
}): Promise<Location | undefined> {
  const {
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
    googleBusinessAccountId,
    googleBusinessLocationId,
    squareAccessToken,
    homebaseApiKey,
    updateSquareCredentials,
    updateHomebaseCredentials,
    hasStoredSquareWebhookSignature,
    updateSquareWebhookSignature,
    squareWebhookSignatureKey,
    logoId,
    clearLogo,
  } = params;
  const trimmedWebhookKey = squareWebhookSignatureKey.trim();
  const squareWebhookPayload =
    updateSquareWebhookSignature
      ? { squareWebhookSignatureKey: trimmedWebhookKey }
      : !hasStoredSquareWebhookSignature && trimmedWebhookKey !== ''
        ? { squareWebhookSignatureKey: trimmedWebhookKey }
        : {};
  if (isEdit && editLocation) {
    const updatePayload = {
      storeName: storeName.trim(),
      address: address.trim(),
      squareLocationId: squareLocationId.trim(),
      homebaseLocationId: homebaseLocationId.trim(),
      timezone: timezone.trim(),
      businessStartTime: businessStartTime.trim(),
      marketManBuyerGuid: marketManBuyerGuid.trim(),
      googleBusinessAccountId: googleBusinessAccountId.trim() || undefined,
      googleBusinessLocationId: googleBusinessLocationId.trim() || undefined,
      ...((updateSquareCredentials || !hasStoredSquare) && squareAccessToken.trim() && { squareAccessToken: squareAccessToken.trim() }),
      ...((updateHomebaseCredentials || !hasStoredHomebase) && homebaseApiKey.trim() && { homebaseApiKey: homebaseApiKey.trim() }),
      ...squareWebhookPayload,
      ...(logoId != null ? { logoId } : {}),
      ...(clearLogo ? { clearLogo: true as const } : {}),
    };
    return locationService.update(editLocation._id, updatePayload);
  }
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
    ...(googleBusinessAccountId.trim()
      ? { googleBusinessAccountId: googleBusinessAccountId.trim() }
      : {}),
    ...(googleBusinessLocationId.trim()
      ? { googleBusinessLocationId: googleBusinessLocationId.trim() }
      : {}),
    ...(logoId != null ? { logoId } : {}),
    ...(trimmedWebhookKey !== '' ? { squareWebhookSignatureKey: trimmedWebhookKey } : {}),
  });
  return undefined;
}
