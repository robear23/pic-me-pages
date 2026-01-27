/**
 * Removes legacy Supabase auth storage keys.
 *
 * Why:
 * If another Supabase client instance (or an older build) ever wrote sessions under
 * the default storage key (sb-<project>-auth-token), that stale refresh_token can
 * keep getting refreshed in the background, triggering 429s and SIGNED_OUT loops.
 *
 * We now use a dedicated storageKey in clientSafe, so this cleanup helps ensure
 * old keys don't interfere.
 */
export const cleanupSupabaseAuthStorage = () => {
  if (typeof window === 'undefined') return;

  try {
    // If we detected a refresh-token storm recently, force-clear our safe auth session.
    // This avoids getting stuck bouncing between "almost signed in" and SIGNED_OUT.
    const STORM_MARKER_KEY = 'colorstory_auth_refresh_storm_at';
    const SAFE_AUTH_KEY = 'colorstory_auth_v2';
    const stormAtRaw = localStorage.getItem(STORM_MARKER_KEY);
    const stormAt = stormAtRaw ? Number(stormAtRaw) : 0;

    if (stormAt && Number.isFinite(stormAt)) {
      const stormWindowMs = 15 * 60_000;
      if (Date.now() - stormAt < stormWindowMs) {
        localStorage.removeItem(SAFE_AUTH_KEY);
      }
      localStorage.removeItem(STORM_MARKER_KEY);
    }

    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Default supabase-js key format: sb-<project-ref>-auth-token
      if (/^sb-.*-auth-token$/.test(key)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    // Some environments can throw on localStorage access; ignore.
    console.warn('[auth] cleanupSupabaseAuthStorage skipped', e);
  }
};
