/** Local id for a pending file row before upload (review questionnaire builder). */
export function newQuestionnairePendingFileId(): string {
  return `q-file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Filename with extension for downloads / blob open (aligned with token document endpoint). */
export function getQuestionAttachmentSuggestedFilename(att: {
  filename?: string;
  format?: string;
}): string | undefined {
  const fn = att.filename?.trim();
  if (fn && !fn.includes("/") && !fn.includes("\\") && /\.[^./\\]+$/i.test(fn)) return fn;
  const fmt = att.format?.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fmt) return `document.${fmt}`;
  return undefined;
}
