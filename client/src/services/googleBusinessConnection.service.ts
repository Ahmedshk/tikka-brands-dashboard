import api from './api.service';
import { API_ENDPOINTS } from '../utils/constants';

export interface GoogleBusinessConnectionStatus {
  connected: boolean;
  connectedEmail?: string;
  connectedAt?: string;
}

export const googleBusinessConnectionService = {
  async getStatus(): Promise<GoogleBusinessConnectionStatus> {
    const { data } = await api.get<GoogleBusinessConnectionStatus>(
      API_ENDPOINTS.GOOGLE_BUSINESS.CONNECTION
    );
    return data;
  },

  async startOAuth(): Promise<string> {
    const { data } = await api.get<{ url: string }>(API_ENDPOINTS.GOOGLE_BUSINESS.OAUTH_START);
    return data.url;
  },

  async disconnect(): Promise<void> {
    await api.delete(API_ENDPOINTS.GOOGLE_BUSINESS.CONNECTION);
  },
};
