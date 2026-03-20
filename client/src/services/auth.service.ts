import api from "./api.service";
import { API_ENDPOINTS } from "../utils/constants";
import type { ApiResponse } from "../types";

export interface ValidateSetPasswordTokenSuccess {
  success: true;
  data: { email: string; firstName: string };
}

export interface ValidateSetPasswordTokenInvalid {
  success: false;
  valid: false;
  expired?: boolean;
  message?: string;
}

export type ValidateSetPasswordTokenResponse =
  | ValidateSetPasswordTokenSuccess
  | ValidateSetPasswordTokenInvalid;

export async function validateSetPasswordToken(
  token: string
): Promise<ValidateSetPasswordTokenResponse> {
  const response = await api.get<ValidateSetPasswordTokenResponse>(
    API_ENDPOINTS.AUTH.SET_PASSWORD_VALIDATE,
    { params: { token } }
  );
  return response.data;
}

export async function setPassword(
  token: string,
  password: string,
  confirmPassword: string
): Promise<ApiResponse> {
  const response = await api.post<ApiResponse>(
    API_ENDPOINTS.AUTH.SET_PASSWORD,
    { token, password, confirmPassword }
  );
  return response.data;
}
