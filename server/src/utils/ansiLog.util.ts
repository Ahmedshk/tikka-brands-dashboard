/**
 * Whether log output should include ANSI color/formatting codes.
 * @see https://no-color.org/
 */
export function ansiLogColorsEnabled(): boolean {
  return Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env);
}

export function escSeq(sequence: string): string {
  return ansiLogColorsEnabled() ? sequence : '';
}
