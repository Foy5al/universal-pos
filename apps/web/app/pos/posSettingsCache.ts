import { posSettingsSchema, type PosSettings } from '@pos/contracts';

const SETTINGS_KEY = 'pos.controls.v1';

/** The verifier is cached deliberately so removal checks work offline. */
export function readCachedPosSettings(): PosSettings | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) return null;
  try {
    const parsed = posSettingsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const verifier = parsed.data.removalPasswordVerifier;
    if (
      verifier &&
      (verifier.iterations < 10_000 || verifier.iterations > 1_000_000 || verifier.hash.length < 16)
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function saveCachedPosSettings(settings: PosSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // A full quota must not break the till; the live response still applies.
  }
}
