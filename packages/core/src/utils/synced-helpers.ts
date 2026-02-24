export const SYNCED_PREFIX = '<SYNCED: ';
export const SYNCED_SUFFIX = '>';

/**
 * Creates a synced tag for a given URL.
 */
export function makeSyncedTag(url: string): string {
  return `${SYNCED_PREFIX}${url}${SYNCED_SUFFIX}`;
}

/**
 * Checks if a string is a valid synced tag.
 */
export function isSyncedTag(value: string | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.startsWith(SYNCED_PREFIX) && trimmed.endsWith(SYNCED_SUFFIX);
}

/**
 * Parses the URL from a synced tag, handles whitespace robustly.
 */
export function parseSyncedUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith(SYNCED_PREFIX) && trimmed.endsWith(SYNCED_SUFFIX)) {
    return trimmed.slice(SYNCED_PREFIX.length, -SYNCED_SUFFIX.length).trim();
  }
  return '';
}

/**
 * Checks if the input contains a manual synced tag attempt.
 */
export function isManualSyncTagAttempt(value: string): boolean {
  return value.includes(SYNCED_PREFIX);
}
