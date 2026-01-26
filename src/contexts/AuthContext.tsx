import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/clientSafe';
import { disableSupabaseAutoRefresh } from '@/contexts/auth/supabaseAutoRefresh';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  getAccessToken: () => null,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Singleton session reference for non-React code (like api.ts)
// This is updated by AuthProvider and can be read synchronously
let currentSession: Session | null = null;

export const getStoredSession = (): Session | null => currentSession;
export const getStoredAccessToken = (): string | null => currentSession?.access_token ?? null;

// Keep built-in refresh disabled as early as possible.
disableSupabaseAutoRefresh();

const base64UrlToBase64 = (input: string) => {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  return (input + pad).replace(/-/g, '+').replace(/_/g, '/');
};

const getJwtExpMs = (jwt: string): number | null => {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    const payloadJson = atob(base64UrlToBase64(parts[1]));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

const getSessionExpiresAtMs = (s: Session): number | null => {
  // Prefer expires_at if available
  if (typeof (s as any).expires_at === 'number') {
    return (s as any).expires_at * 1000;
  }
  // Fallback to JWT exp
  return s.access_token ? getJwtExpMs(s.access_token) : null;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Tracks whether we've established a session (null or valid) from a reliable source
  const initializedRef = useRef(false);

  // Track the latest session to prevent stale updates
  const sessionRef = useRef<Session | null>(null);

  // Robust token refresh control (prevents refresh storms / 429 loops)
  const refreshTimerRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastRefreshAttemptAtRef = useRef<number>(0);
  const lastRefreshErrorAtRef = useRef<number>(0);
  const backoffMsRef = useRef<number>(0);

  // Storm guard: if refresh events happen too frequently, disable refresh temporarily.
  const stormWindowStartRef = useRef<number>(0);
  const stormCountRef = useRef<number>(0);
  const autoRefreshDisabledUntilRef = useRef<number>(0);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const updateSession = useCallback((newSession: Session | null) => {
    sessionRef.current = newSession;
    currentSession = newSession; // Update singleton for non-React code
    setSession(newSession);
    setUser(newSession?.user ?? null);
  }, []);

  const getAccessToken = useCallback(() => {
    return sessionRef.current?.access_token ?? null;
  }, []);

  const scheduleRefresh = useCallback(
    (s: Session) => {
      clearRefreshTimer();

      const expiresAtMs = getSessionExpiresAtMs(s);
      if (!expiresAtMs) return;

      // Refresh a bit before expiry, but prevent tight loops.
      const bufferMs = 90_000; // 90s
      const now = Date.now();
      let delayMs = Math.max(0, expiresAtMs - now - bufferMs);

      // If something keeps producing very short-lived sessions, back off.
      const refreshedVeryRecently = now - lastRefreshAttemptAtRef.current < 60_000;
      if (refreshedVeryRecently && delayMs < 60_000) {
        delayMs = 60_000;
      }

      // Apply backoff if we recently hit rate limits.
      if (backoffMsRef.current > 0) {
        delayMs = Math.max(delayMs, backoffMsRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        void refreshNow('scheduled');
      }, delayMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearRefreshTimer]
  );

  const refreshNow = useCallback(
    async (reason: 'scheduled' | 'focus' | 'manual') => {
      const now = Date.now();
      if (now < autoRefreshDisabledUntilRef.current) {
        console.warn('[AuthContext] refreshNow skipped (storm guard active)', { reason });
        return;
      }

      if (refreshInFlightRef.current) return refreshInFlightRef.current;

      refreshInFlightRef.current = (async () => {
        lastRefreshAttemptAtRef.current = Date.now();

        const { data, error } = await supabase.auth.refreshSession();

        // refreshSession can re-enable internal auto refresh; keep it off.
        disableSupabaseAutoRefresh();

        if (error) {
          lastRefreshErrorAtRef.current = Date.now();

          const status = (error as any).status;
          const msg = String((error as any).message || error);
          const isRateLimit = status === 429 || /rate\s*limit/i.test(msg);

          // Backoff on rate limits to avoid being auto-signed-out.
          if (isRateLimit) {
            backoffMsRef.current = backoffMsRef.current
              ? Math.min(backoffMsRef.current * 2, 5 * 60_000)
              : 30_000;
          } else {
            backoffMsRef.current = Math.min(Math.max(backoffMsRef.current, 10_000), 60_000);
          }

          // Try again later; do NOT clear session here.
          if (sessionRef.current) {
            scheduleRefresh(sessionRef.current);
          }
          return;
        }

        // Successful refresh resets backoff.
        backoffMsRef.current = 0;

        if (data?.session) {
          updateSession(data.session);
        }
      })()
        .catch((e) => {
          // Avoid unhandled promise rejections
          console.error('[AuthContext] refreshSession failed:', e);
        })
        .finally(() => {
          refreshInFlightRef.current = null;
        });

      return refreshInFlightRef.current;
    },
    [scheduleRefresh, updateSession]
  );

  useEffect(() => {
    // Keep built-in auto refresh disabled.
    disableSupabaseAutoRefresh();

    let mounted = true;

    const finalizeInit = () => {
      initializedRef.current = true;
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // Ensure the built-in refresher never comes back.
      disableSupabaseAutoRefresh();

      console.log('[AuthContext] Auth event:', event, nextSession ? 'has session' : 'no session');

      const now = Date.now();

      switch (event) {
        case 'INITIAL_SESSION':
          updateSession(nextSession);
          finalizeInit();
          break;

        case 'SIGNED_IN':
          updateSession(nextSession);
          finalizeInit();
          break;

        case 'TOKEN_REFRESHED': {
          // Storm detection: if we get multiple TOKEN_REFRESHED events in a short window,
          // the SDK is likely stuck in a refresh loop → it will hit 429 and sign the user out.
          if (stormWindowStartRef.current === 0 || now - stormWindowStartRef.current > 10_000) {
            stormWindowStartRef.current = now;
            stormCountRef.current = 0;
          }
          stormCountRef.current += 1;

          if (stormCountRef.current >= 3) {
            console.error(
              '[AuthContext] Refresh-token storm detected; disabling refresh for 5 minutes to prevent 429 + sign-out.'
            );
            autoRefreshDisabledUntilRef.current = now + 5 * 60_000;
            clearRefreshTimer();
            disableSupabaseAutoRefresh();
          }

          updateSession(nextSession);
          finalizeInit();
          break;
        }

        case 'SIGNED_OUT':
          // We only clear session on explicit sign-out; refresh errors are handled by backoff.
          updateSession(null);
          backoffMsRef.current = 0;
          clearRefreshTimer();
          finalizeInit();
          break;

        case 'USER_UPDATED':
          if (nextSession) updateSession(nextSession);
          break;

        default:
          if (nextSession) updateSession(nextSession);
          if (!initializedRef.current) finalizeInit();
      }
    });

    // NOTE:
    // We intentionally avoid calling supabase.auth.getSession() here.
    // In some browser environments it can trigger session recovery paths that
    // attempt refresh_token calls during startup, contributing to refresh storms.
    // We rely on the INITIAL_SESSION event from onAuthStateChange instead.

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!sessionRef.current) return;
      if (Date.now() < autoRefreshDisabledUntilRef.current) return;

      // Only refresh on focus if we're close to expiry; otherwise just ensure a refresh is scheduled.
      const expiresAtMs = getSessionExpiresAtMs(sessionRef.current);
      if (expiresAtMs && expiresAtMs - Date.now() < 2 * 60_000) {
        void refreshNow('focus');
      } else {
        scheduleRefresh(sessionRef.current);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisibility);
      subscription.unsubscribe();
      clearRefreshTimer();
    };
  }, [clearRefreshTimer, refreshNow, scheduleRefresh, updateSession]);

  // Whenever session changes, schedule the next refresh.
  useEffect(() => {
    if (session) {
      scheduleRefresh(session);
    } else {
      clearRefreshTimer();
    }
  }, [session, scheduleRefresh, clearRefreshTimer]);

  return (
    <AuthContext.Provider value={{ user, session, loading, getAccessToken }}>{children}</AuthContext.Provider>
  );
};
