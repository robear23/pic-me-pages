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
