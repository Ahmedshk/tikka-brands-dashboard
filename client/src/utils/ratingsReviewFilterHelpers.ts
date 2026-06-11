export interface RatingsReviewRatingBounds {
  minRating?: number;
  maxRating?: number;
}

export function parseRatingBoundInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 1 || n > 5) return undefined;
  return n;
}

export function resolveRatingsReviewRatingBounds(
  minInput: string,
  maxInput: string,
): { bounds: RatingsReviewRatingBounds; error: string | null } {
  const minRating = parseRatingBoundInput(minInput);
  const maxRating = parseRatingBoundInput(maxInput);

  if (minInput.trim() !== '' && minRating === undefined) {
    return { bounds: {}, error: 'Min rating must be between 1 and 5.' };
  }
  if (maxInput.trim() !== '' && maxRating === undefined) {
    return { bounds: {}, error: 'Max rating must be between 1 and 5.' };
  }
  if (minRating != null && maxRating != null && minRating > maxRating) {
    return { bounds: {}, error: 'Min rating cannot be greater than max rating.' };
  }

  return {
    bounds: {
      ...(minRating != null ? { minRating } : {}),
      ...(maxRating != null ? { maxRating } : {}),
    },
    error: null,
  };
}

/** Validates draft min/max before applying the rating filter (both fields required). */
export function validateRatingFilterForApply(
  minInput: string,
  maxInput: string,
): { bounds: RatingsReviewRatingBounds; error: string | null } {
  if (minInput.trim() === '' || maxInput.trim() === '') {
    return { bounds: {}, error: 'Enter both min and max star ratings.' };
  }
  return resolveRatingsReviewRatingBounds(minInput, maxInput);
}

export function hasActiveRatingFilter(minInput: string, maxInput: string): boolean {
  return minInput.trim() !== '' && maxInput.trim() !== '';
}
