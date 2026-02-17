export interface ILogo {
  _id?: string;
  dataUrl: string;
  contentType?: string | undefined;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ILogoResponse = ILogo;
