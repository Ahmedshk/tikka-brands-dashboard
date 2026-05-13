import { getDocumentFormatFromApiModuleFile } from './createTrainingModalHelpers';

export const ACTION_PLAN_PERIODS = ['30', '60', '90'] as const;

export function formatActionPlanScore(score: unknown): string {
  if (score == null) return 'N/A';

  switch (typeof score) {
    case 'string':
      return score.trim() ? score : 'N/A';
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(score);
    case 'symbol':
    case 'function':
      return score.toString();
    case 'object': {
      const s = score as Record<string, unknown>;
      if (typeof s.display === 'string' && s.display.trim()) return s.display;
      if (typeof s.label === 'string' && s.label.trim()) return s.label;
      if (typeof s.value === 'string' && s.value.trim()) return s.value;
      if (typeof s.value === 'number') return String(s.value);
      if (typeof s.score === 'string' && s.score.trim()) return s.score;
      if (typeof s.score === 'number') return String(s.score);

      try {
        return JSON.stringify(score);
      } catch {
        return 'N/A';
      }
    }
    default:
      return 'N/A';
  }
}

export function hasValidPublicId(publicId?: string): boolean {
  return Boolean(publicId && publicId.trim() && !/^https?:\/\//i.test(publicId));
}

export function getLegacyUrl(doc: { url?: string; publicId?: string }): string | null {
  if (doc.url?.trim()) return doc.url.trim();
  if (doc.publicId && /^https?:\/\//i.test(doc.publicId)) return doc.publicId;
  return null;
}

export function isImageDoc(doc: {
  resourceType?: string;
  format?: string;
  filename?: string;
  url?: string;
}): boolean {
  if (doc.resourceType === 'image') return true;
  const format = getDocumentFormatFromApiModuleFile(doc);
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(format)) return true;
  const rawUrl = doc.url?.split('?')[0] ?? '';
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(rawUrl);
}

export function getCheckInProgressRows<
  TPlanItem extends { description: string; currentScore?: unknown; targetScore?: unknown },
>(
  actionPlanItems: TPlanItem[],
  ci: { actionItemProgress?: { actionPlanItemIndex: number; value?: string }[] },
): Array<{ progress: { actionPlanItemIndex: number; value?: string }; planItem: TPlanItem }> {
  return (ci.actionItemProgress ?? [])
    .map((p) => ({ progress: p, planItem: actionPlanItems[p.actionPlanItemIndex] }))
    .filter(
      (row): row is { progress: { actionPlanItemIndex: number; value?: string }; planItem: TPlanItem } =>
        Boolean(row.planItem),
    );
}

