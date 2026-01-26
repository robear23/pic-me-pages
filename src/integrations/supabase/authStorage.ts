type StoredSession = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // seconds
};

/**
 * Minimal storage adapter for supabase-js auth.
 *
 * Key behavior: if the stored session is clearly expired/corrupt, we delete it
 * instead of returning it.
 *
 * Why this matters:
 * supabase-js will attempt to refresh sessions it considers expired during
 * startup recovery. If that happens repeatedly (or concurrently), it can cause
 * refresh-token storms, 429 rate limits, and forced SIGNED_OUT.
 */
export const createSupabaseAuthStorage = (storageKey: string) => {
  return {
    getItem: (key: string) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        if (key !== storageKey) return raw;

        // Validate session JSON for our auth key.
        let parsed: StoredSession | null = null;
        try {
          parsed = JSON.parse(raw) as StoredSession;
        } catch {
          localStorage.removeItem(key);
          return null;
        }

        // If it's missing required fields, treat as corrupt.
        if (!parsed?.access_token || !parsed?.refresh_token) {
          localStorage.removeItem(key);
          return null;
        }

        // If it's clearly expired, clear it (avoid auto refresh loops on startup).
        if (typeof parsed.expires_at === 'number') {
          const expMs = parsed.expires_at * 1000;
          const now = Date.now();
          const graceMs = 30_000;
          if (expMs + graceMs < now) {
            localStorage.removeItem(key);
            return null;
          }
        }

        return raw;
      } catch {
        // If localStorage is unavailable, behave like empty.
        return null;
      }
    },

    setItem: (key: string, value: string) => {
      localStorage.setItem(key, value);
    },

    removeItem: (key: string) => {
      localStorage.removeItem(key);
    },
  };
};
