import type { ReviewCycle } from "../types/review.types";
import {
  getDirectorReviewStageLabel,
  getStageStatuses,
} from "../types/review.types";
import type { ReviewTrackerDonut } from "../components/TrainingReviews";

/** Single green for completed / approved segments across all review tracker donuts. */
const REVIEW_TRACKER_COMPLETE_COLOR = "#5DC54F";
/** Neutral segment (e.g. “—” on non–self-review donuts); “Upcoming” on self review uses the same grey. */
const REVIEW_TRACKER_NEUTRAL_GRAY = "#9CA3AF";

const STAGE_LABELS = {
  selfReview: [
    "Upcoming",
    "75-Day Notice Sent",
    "Form Available",
    "Due",
    "Late",
    "Past due",
    "Complete",
  ],
  managerReview: ["—", "Due", "Past due", "Complete"],
  directorReview: ["—", "Due", "Past due", "Complete", "Revisions requested"],
  finalReview: ["—", "Due", "Past due", "Complete"],
  checkin30: ["—", "Due", "Past due", "Complete"],
  checkin60: ["—", "Due", "Past due", "Complete"],
} as const;

const STAGE_TITLES: Record<keyof typeof STAGE_LABELS, string> = {
  selfReview: "Self Review",
  managerReview: "Manager Review",
  directorReview: "DO Review",
  finalReview: "Final Review",
  checkin30: "30 Day Check-in",
  checkin60: "60 Day Check-in",
};

function getTrackerColorDefault(label: string): string {
  if (label === "—") return REVIEW_TRACKER_NEUTRAL_GRAY;
  if (label === "Past due" || label === "Late" || label === "Rejected") return "#EF4444";
  if (label === "Revisions requested") return "#F59E0B";
  if (
    label === "Due" ||
    label === "Pending" ||
    label === "Form Available" ||
    label === "Upcoming" ||
    label === "75-Day Notice Sent"
  )
    return "#FBC52A";
  if (label === "Complete" || label === "Done" || label === "Approved")
    return REVIEW_TRACKER_COMPLETE_COLOR;
  return REVIEW_TRACKER_NEUTRAL_GRAY;
}

function getSelfReviewTrackerColor(label: string): string {
  if (label === "Complete") return REVIEW_TRACKER_COMPLETE_COLOR;
  if (label === "Past due") return "#EF4444"; // red
  if (label === "Late") return "#F59E0B"; // yellow
  if (label === "Due") return "#FBC52A"; // yellow (consistent with other Due labels)
  if (label === "Form Available") return "#06B6D4"; // cyan
  if (label === "Upcoming") return REVIEW_TRACKER_NEUTRAL_GRAY;
  if (label === "75-Day Notice Sent") return "#EC4899"; // pink
  return REVIEW_TRACKER_NEUTRAL_GRAY;
}

export function buildReviewTrackerDonuts(activeCycles: ReviewCycle[]): ReviewTrackerDonut[] {
  type StageKey = keyof typeof STAGE_LABELS;
  const stageKeys = Object.keys(STAGE_LABELS) as StageKey[];

  const countsByStage = stageKeys.reduce((acc, stageKey) => {
    const initCounts = Object.fromEntries(
      STAGE_LABELS[stageKey].map((label) => [label, 0]),
    );
    acc[stageKey] = initCounts as Record<string, number>;
    return acc;
  }, {} as Record<StageKey, Record<string, number>>);

  activeCycles.forEach((cycle) => {
    const stages = getStageStatuses(cycle.status);

    stageKeys.forEach((stageKey) => {
      const rawLabel =
        stageKey === "directorReview"
          ? getDirectorReviewStageLabel(cycle)
          : stages[stageKey];

      let label = rawLabel;
      if (
        stageKey === "directorReview" &&
        (rawLabel === "Approved" || rawLabel === "Rejected")
      ) {
        label = "Complete";
      } else if (
        (stageKey === "managerReview" ||
          stageKey === "directorReview" ||
          stageKey === "finalReview") &&
        rawLabel === "Pending"
      ) {
        label = "Due";
      }

      countsByStage[stageKey][label] = (countsByStage[stageKey][label] ?? 0) + 1;
    });
  });

  return stageKeys.map((stageKey) => ({
    id: stageKey,
    title: STAGE_TITLES[stageKey],
    total: activeCycles.length,
    segments: STAGE_LABELS[stageKey].map((label) => ({
      id: `${stageKey}-${label}`,
      label,
      count: countsByStage[stageKey][label] ?? 0,
      color:
        stageKey === "selfReview"
          ? getSelfReviewTrackerColor(label)
          : getTrackerColorDefault(label),
    })),
  }));
}

