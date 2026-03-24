/** Local id for a pending file row before upload (review questionnaire builder). */
export function newQuestionnairePendingFileId(): string {
  return `q-file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}
