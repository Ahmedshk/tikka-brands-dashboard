import { format } from 'date-fns';
import { locationService } from '../services/location.service';
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

export function getLogoListButtonLabel(loading: boolean, open: boolean): string {
  if (loading) return 'Loading...';
  return open ? 'Hide logos' : 'Pick from existing';
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
  squareAccessToken: string;
  homebaseApiKey: string;
  updateSquareCredentials: boolean;
  updateHomebaseCredentials: boolean;
  logoId: string | null;
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
    squareAccessToken,
    homebaseApiKey,
    updateSquareCredentials,
    updateHomebaseCredentials,
    logoId,
  } = params;
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
      ...((updateSquareCredentials || !hasStoredSquare) && squareAccessToken.trim() && { squareAccessToken: squareAccessToken.trim() }),
      ...((updateHomebaseCredentials || !hasStoredHomebase) && homebaseApiKey.trim() && { homebaseApiKey: homebaseApiKey.trim() }),
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
    ...(logoId ? { logoId } : {}),
  });
  return undefined;
}
