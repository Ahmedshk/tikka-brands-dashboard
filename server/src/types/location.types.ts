export interface ILocation {
  _id?: string;
  storeName: string;
  address: string;
  squareLocationId: string;
  homebaseLocationId: string;
  timezone: string;
  businessStartTime: string;
  createdAt?: Date;
  updatedAt?: Date;
}
