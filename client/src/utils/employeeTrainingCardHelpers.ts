import type { EmployeeTrainingRow } from "../types/trainingReviews.types";

export type EmployeeTrainingCardViewState =
  | { kind: "loading" }
  | { kind: "empty-search" }
  | { kind: "empty-no-search" }
  | { kind: "empty-hierarchy" }
  | { kind: "rows" };

export function getEmployeeTrainingCardViewState(params: {
  loading: boolean;
  debouncedSearch: string;
  searchMatchCount: number;
  filteredTotal: number;
}): EmployeeTrainingCardViewState {
  const { loading, debouncedSearch, searchMatchCount, filteredTotal } = params;
  if (loading) return { kind: "loading" };
  if (searchMatchCount === 0) {
    return debouncedSearch ? { kind: "empty-search" } : { kind: "empty-no-search" };
  }
  if (filteredTotal === 0) return { kind: "empty-hierarchy" };
  return { kind: "rows" };
}

export function getEmployeeTrainingRowKey(row: EmployeeTrainingRow, index: number, variant: "desktop" | "mobile") {
  const base = row.assignmentId ?? `${row.trainingName}-${row.assignTo}`;
  return `${variant}-${row.locationId ?? ""}-${base}-${index}`;
}

