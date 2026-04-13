export interface ILogo {
  _id?: string;
  url: string;
  publicId: string;
  name?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ILogoResponse = ILogo;
