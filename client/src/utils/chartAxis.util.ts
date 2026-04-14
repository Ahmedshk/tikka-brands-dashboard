export function roundUpToStep(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  const s = step > 0 ? step : 1;
  return Math.ceil(value / s) * s;
}

export function computePaddedMax(values: number[], params?: { min?: number; padMultiplier?: number; step?: number }): number {
  const min = params?.min ?? 0;
  const padMultiplier = params?.padMultiplier ?? 1.1;
  const step = params?.step ?? 10;
  const max = values.length > 0 ? Math.max(...values.filter((v) => Number.isFinite(v))) : 0;
  const padded = Math.max(min, max * padMultiplier);
  return roundUpToStep(padded, step);
}

