export function replaceAt<T>(arr: readonly T[], index: number, value: T): T[] {
  return arr.map((item, i) => (i === index ? value : item));
}

export function removeAt<T>(arr: readonly T[], index: number): T[] {
  return arr.filter((_, i) => i !== index);
}

export function getStableOptionKey(
  questionId: string,
  options: readonly string[],
  optionValue: string,
  optionIndex: number,
): string {
  const duplicatesBefore = options.slice(0, optionIndex).filter((o) => o === optionValue).length;
  return `${questionId}::${optionValue}::${duplicatesBefore}`;
}

