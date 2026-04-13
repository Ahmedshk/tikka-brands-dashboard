export interface ILocation {
  _id?: string;
  storeName: string;
  address: string;
  squareLocationId: string;
  /** Optional Square merchant id for webhook routing (same app, multiple locations). */
  squareMerchantId?: string;
  homebaseLocationId: string;
  timezone: string;
  businessStartTime: string;
  squareAccessTokenEnc?: string;
  homebaseApiKeyEnc?: string;
  squareWebhookSignatureKeyEnc?: string;
  logoId?: string | null;
  marketManBuyerGuid?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Location shape for list endpoints (GET /locations).
 * Excludes sensitive integration fields: squareLocationId, homebaseLocationId, marketManBuyerGuid, tokens, etc.
 * Address and business hours are included for admin location-management UI.
 */
export interface ILocationListItem {
  _id: string;
  storeName: string;
  address: string;
  timezone: string;
  businessStartTime: string;
  logoUrl?: string;
}

/** Location as returned to API responses (no encrypted credentials). */
export interface ILocationResponse extends Omit<ILocation, 'squareAccessTokenEnc' | 'homebaseApiKeyEnc'> {
  /** True when this location has a stored Square access token (value never sent to client). */
  hasSquareAccessToken?: boolean;
  /** True when this location has a stored Homebase API key (value never sent to client). */
  hasHomebaseApiKey?: boolean;
  /** True when this location has a stored Square webhook signature key (value never sent to client). */
  hasSquareWebhookSignatureKey?: boolean;
  /** Cloudinary URL for the location logo (populated from Logo collection via logoId). */
  logoUrl?: string;
}

export type CreateLocationData = Omit<
  ILocation,
  '_id' | 'createdAt' | 'updatedAt' | 'squareAccessTokenEnc' | 'homebaseApiKeyEnc' | 'squareWebhookSignatureKeyEnc'
> & {
  squareAccessToken: string;
  homebaseApiKey: string;
  squareMerchantId?: string;
  /** Plaintext; stored encrypted. Optional per-location Square webhook subscription key. */
  squareWebhookSignatureKey?: string;
};

export type UpdateLocationData = Partial<
  Omit<ILocation, '_id' | 'createdAt' | 'updatedAt' | 'squareAccessTokenEnc' | 'homebaseApiKeyEnc' | 'squareWebhookSignatureKeyEnc'>
> & {
  squareAccessToken?: string;
  homebaseApiKey?: string;
  logoId?: string | null;
  squareMerchantId?: string;
  /**
   * When provided: non-empty string encrypts and stores; empty string removes stored key.
   * When omitted: leave existing value unchanged.
   */
  squareWebhookSignatureKey?: string;
};

export interface LocationWithCredentials {
  location: ILocationResponse;
  squareAccessToken: string | null;
  homebaseApiKey: string | null;
}
