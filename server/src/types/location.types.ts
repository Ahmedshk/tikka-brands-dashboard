export interface ILocation {
  _id?: string;
  storeName: string;
  address: string;
  squareLocationId: string;
  homebaseLocationId: string;
  timezone: string;
  businessStartTime: string;
  squareAccessTokenEnc?: string;
  homebaseApiKeyEnc?: string;
  logoId?: string | null;
  marketManBuyerGuid?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Minimal location shape for list endpoints (GET /locations).
 * Excludes sensitive fields: address, squareLocationId, homebaseLocationId, marketManBuyerGuid, etc.
 */
export interface ILocationListItem {
  _id: string;
  storeName: string;
  timezone: string;
  logoDataUrl?: string;
}

/** Location as returned to API responses (no encrypted credentials). */
export interface ILocationResponse extends Omit<ILocation, 'squareAccessTokenEnc' | 'homebaseApiKeyEnc'> {
  /** True when this location has a stored Square access token (value never sent to client). */
  hasSquareAccessToken?: boolean;
  /** True when this location has a stored Homebase API key (value never sent to client). */
  hasHomebaseApiKey?: boolean;
  /** Populated when location has a logo; data URL for display (e.g. sidebar). */
  logoDataUrl?: string;
}

export type CreateLocationData = Omit<ILocation, '_id' | 'createdAt' | 'updatedAt' | 'squareAccessTokenEnc' | 'homebaseApiKeyEnc'> & {
  squareAccessToken: string;
  homebaseApiKey: string;
};

export type UpdateLocationData = Partial<Omit<ILocation, '_id' | 'createdAt' | 'updatedAt' | 'squareAccessTokenEnc' | 'homebaseApiKeyEnc'>> & {
  squareAccessToken?: string;
  homebaseApiKey?: string;
  logoId?: string | null;
};

export interface LocationWithCredentials {
  location: ILocationResponse;
  squareAccessToken: string | null;
  homebaseApiKey: string | null;
}
