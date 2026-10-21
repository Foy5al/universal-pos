const THRESHOLD_PATTERN = /^\d{1,12}(\.\d{1,4})?$/;

/**
 * Empty input clears the threshold. `undefined` means the value is invalid so
 * the form can show an error without calling the API.
 */
export function parseThresholdInput(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return THRESHOLD_PATTERN.test(trimmed) ? trimmed : undefined;
}
