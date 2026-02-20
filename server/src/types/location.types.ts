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

/** Location as returned to API responses (no encrypted credentials). */
export interface ILocationResponse extends Omit<ILocation, 'squareAccessTokenEnc' | 'homebaseApiKeyEnc'> {
  /** True when this location has a stored Square access token (value never sent to client). */
  hasSquareAccessToken?: boolean;
  /** True when this location has a stored Homebase API key (value never sent to client). */
  hasHomebaseApiKey?: boolean;
  /** Populated when location has a logo; data URL for display (e.g. sidebar). */
  logoDataUrl?: string;
}
