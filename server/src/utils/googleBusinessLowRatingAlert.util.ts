export function isBelowLowRatingThreshold(starRatingNumeric: number, threshold: number): boolean {
  return starRatingNumeric < threshold;
}
