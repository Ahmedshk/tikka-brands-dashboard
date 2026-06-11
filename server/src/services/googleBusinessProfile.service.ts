import { logExternalApiResult } from "../utils/externalApiCallLog.util.js";
import { AppError } from "../utils/errors.util.js";
import type {
  GoogleBusinessApiReviewsListResponse,
} from "../types/googleBusinessReview.types.js";
import { getGoogleBusinessAccessToken } from "./googleBusinessConnection.service.js";

const MYBUSINESS_REVIEWS_BASE = "https://mybusiness.googleapis.com/v4";

export type GoogleBusinessExternalProvider = "GoogleBusiness";

export async function listGoogleBusinessReviews(
  accountId: string,
  locationId: string,
  pageToken?: string,
  pageSize = 50,
): Promise<GoogleBusinessApiReviewsListResponse> {
  const accessToken = await getGoogleBusinessAccessToken();
  const url = new URL(
    `${MYBUSINESS_REVIEWS_BASE}/accounts/${accountId}/locations/${locationId}/reviews`,
  );
  url.searchParams.set("pageSize", String(pageSize));
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const started = Date.now();
  let httpStatus: number | undefined;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    httpStatus = res.status;
    const text = await res.text();
    if (!res.ok) {
      const errMsg = text.slice(0, 480) || res.statusText;
      logExternalApiResult("GoogleBusiness", "listReviews", {
        outcome: "error",
        durationMs: Date.now() - started,
        httpStatus,
        error: errMsg,
        accountId,
        locationId,
      });
      throw new AppError(
        `Google Business Profile reviews API error (${res.status}): ${errMsg}`,
        res.status >= 500 ? 502 : 400,
      );
    }

    const data = JSON.parse(text) as GoogleBusinessApiReviewsListResponse;
    logExternalApiResult("GoogleBusiness", "listReviews", {
      outcome: "ok",
      durationMs: Date.now() - started,
      httpStatus,
      accountId,
      locationId,
      reviewCount: data.reviews?.length ?? 0,
    });
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    logExternalApiResult("GoogleBusiness", "listReviews", {
      outcome: "error",
      durationMs: Date.now() - started,
      ...(httpStatus != null ? { httpStatus } : {}),
      error: msg,
      accountId,
      locationId,
    });
    throw new AppError(`Google Business Profile reviews request failed: ${msg}`, 502);
  }
}

export async function listAllGoogleBusinessReviews(
  accountId: string,
  locationId: string,
): Promise<{
  reviews: NonNullable<GoogleBusinessApiReviewsListResponse["reviews"]>;
  totalReviewCount: number;
  averageRating: number;
}> {
  const allReviews: NonNullable<GoogleBusinessApiReviewsListResponse["reviews"]> = [];
  let pageToken: string | undefined;
  let totalReviewCount = 0;
  let averageRating = 0;

  do {
    const page = await listGoogleBusinessReviews(accountId, locationId, pageToken);
    if (page.reviews?.length) {
      allReviews.push(...page.reviews);
    }
    if (page.totalReviewCount != null) {
      totalReviewCount = page.totalReviewCount;
    }
    if (page.averageRating != null) {
      averageRating = page.averageRating;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return { reviews: allReviews, totalReviewCount, averageRating };
}
