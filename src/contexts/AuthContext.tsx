import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep an always-current reference so async callbacks don't overwrite newer auth state
  const currentSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    // Disable supabase-js automatic refresh to prevent refresh storms (429 rate limits)
    // and handle refresh scheduling ourselves in a single place.
    try {
      supabase.auth.stopAutoRefresh();
    } catch {
      // ignore
    }

    const refreshTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

    const clearRefreshTimer = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };

    const scheduleRefresh = (nextSession: Session | null) => {
      clearRefreshTimer();

      if (!nextSession?.refresh_token || !nextSession.expires_at) return;

      // Refresh 60s before expiry; never sooner than 30s from now.
      const msUntilRefresh = Math.max(30_000, nextSession.expires_at * 1000 - Date.now() - 60_000);

      refreshTimerRef.current = setTimeout(() => {
        const attemptRefresh = async (attempt = 0) => {
          try {
            const { data, error } = await supabase.auth.refreshSession();
            if (error) throw error;

            // Keep local state in sync even if the auth event is delayed
            currentSessionRef.current = data.session;
            setSession(data.session);
            setUser(data.session?.user ?? null);
            scheduleRefresh(data.session);
          } catch (e: any) {
            const message = String(e?.message ?? '');
            const isRateLimit = e?.status === 429 || message.toLowerCase().includes('rate limit');
            const backoffMs = isRateLimit
              ? Math.min(5 * 60_000, 60_000 * Math.pow(2, attempt))
              : 60_000;

            refreshTimerRef.current = setTimeout(() => attemptRefresh(attempt + 1), backoffMs);
          }
        };

        attemptRefresh();
      }, msUntilRefresh);
    };

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // supabase-js may restart auto refresh after SIGNED_IN; stop it every time to prevent storms.
      try {
        supabase.auth.stopAutoRefresh();
      } catch {
        // ignore
      }

      currentSessionRef.current = nextSession;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      scheduleRefresh(nextSession);
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      // If an auth event already set a session, don't let a stale getSession(null) wipe it out.
      if (currentSessionRef.current && !session) {
        setLoading(false);
        scheduleRefresh(currentSessionRef.current);
        return;
      }

      currentSessionRef.current = session;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      scheduleRefresh(session);
    });

    return () => {
      clearRefreshTimer();
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
