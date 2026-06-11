import api from './api.service';
import { API_ENDPOINTS } from '../utils/constants';

export type GoogleBusinessReviewPeriod =
  | 'today'
  | 'weekToDate'
  | 'month'
  | 'custom'
  | 'all';

export interface GoogleBusinessReviewRow {
  _id: string;
  locationId: string;
  locationName?: string;
  googleReviewId: string;
  googleReviewName: string;
  starRating: string;
  starRatingNumeric: number;
  comment?: string;
  reviewer: { displayName: string; profilePhotoUrl: string };
  createTime: string;
  updateTime: string;
  reviewReply?: { comment: string; updateTime: string };
}

export interface GoogleBusinessReviewsResponse {
  reviews: GoogleBusinessReviewRow[];
  summary: { averageRating: number | null; reviewCount: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const googleBusinessReviewService = {
  async list(params: {
    locationId: string;
    period?: GoogleBusinessReviewPeriod;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    minRating?: number;
    maxRating?: number;
  }): Promise<GoogleBusinessReviewsResponse> {
    const { data } = await api.get<GoogleBusinessReviewsResponse>(
      API_ENDPOINTS.GOOGLE_BUSINESS_REVIEWS,
      { params }
    );
    return data;
  },
};
