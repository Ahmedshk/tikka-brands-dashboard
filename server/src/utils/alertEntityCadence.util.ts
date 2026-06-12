import type { AlertEntityCadence } from "../types/alertNotification.types.js";

export interface AlertEntityCadenceStateSnapshot {
  isActive?: boolean;
  lastAlertedAt?: Date | string | null;
  episodeStartedAt?: Date | string | null;
}

export interface AlertEntityCadenceSendPlan {
  shouldSend: boolean;
  fireKey: string;
  nextEpisodeStartedAt: Date | null;
  nextLastAlertedAt: Date | null;
}

export function toAlertEntityCadenceSnapshot(
  prev:
    | {
        isActive?: boolean;
        isLow?: boolean;
        lastAlertedAt?: Date | string | null;
        episodeStartedAt?: Date | string | null;
      }
    | undefined,
): AlertEntityCadenceStateSnapshot | undefined {
  if (!prev) {
    return undefined;
  }
  const isActive = prev.isActive != null ? Boolean(prev.isActive) : Boolean(prev.isLow);
  const snapshot: AlertEntityCadenceStateSnapshot = { isActive };
  if (prev.lastAlertedAt != null) {
    snapshot.lastAlertedAt = prev.lastAlertedAt;
  }
  if (prev.episodeStartedAt != null) {
    snapshot.episodeStartedAt = prev.episodeStartedAt;
  }
  return snapshot;
}

export function normalizeAlertEntityCadence(value: unknown): AlertEntityCadence {
  if (
    value === "every_run" ||
    value === "once_per_day" ||
    value === "once_per_episode"
  ) {
    return value;
  }
  return "once_per_episode";
}

/**
 * Decide whether to alert for one entity and which fireKey to use.
 * `entityKeySuffix` is appended to bucket/day/episode keys (e.g. `order:PO-1`).
 */
export function computeAlertEntityCadenceSendPlan(
  cadence: AlertEntityCadence,
  prev: AlertEntityCadenceStateSnapshot | undefined,
  dayKey: string,
  tickFireKey: string,
  tickAnchorMs: number,
  entityKeySuffix: string,
): AlertEntityCadenceSendPlan {
  if (cadence === "every_run") {
    return {
      shouldSend: true,
      fireKey: `${tickFireKey}|${entityKeySuffix}`,
      nextEpisodeStartedAt: null,
      nextLastAlertedAt: null,
    };
  }
  if (cadence === "once_per_day") {
    return {
      shouldSend: true,
      fireKey: `${dayKey}|${entityKeySuffix}`,
      nextEpisodeStartedAt: null,
      nextLastAlertedAt: null,
    };
  }
  const wasActive = Boolean(prev?.isActive);
  const alreadyAlerted = prev?.lastAlertedAt != null;
  if (!wasActive) {
    const now = new Date(tickAnchorMs);
    return {
      shouldSend: true,
      fireKey: `${now.toISOString()}|${entityKeySuffix}`,
      nextEpisodeStartedAt: now,
      nextLastAlertedAt: now,
    };
  }
  if (!alreadyAlerted) {
    const nextEpisodeStartedAt = prev?.episodeStartedAt
      ? new Date(prev.episodeStartedAt)
      : new Date(tickAnchorMs);
    return {
      shouldSend: true,
      fireKey: `${nextEpisodeStartedAt.toISOString()}|${entityKeySuffix}`,
      nextEpisodeStartedAt,
      nextLastAlertedAt: new Date(tickAnchorMs),
    };
  }
  return {
    shouldSend: false,
    fireKey: "",
    nextEpisodeStartedAt: null,
    nextLastAlertedAt: null,
  };
}
