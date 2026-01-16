import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Tracks whether we've established a session (null or valid) from a reliable source
  const initializedRef = useRef(false);
  
  // Track the latest session to prevent stale updates
  const sessionRef = useRef<Session | null>(null);

  // Update both state and singleton when session changes
  const updateSession = useCallback((newSession: Session | null) => {
    sessionRef.current = newSession;
    currentSession = newSession; // Update singleton for non-React code
    setSession(newSession);
    setUser(newSession?.user ?? null);
  }, []);

  const getAccessToken = useCallback(() => {
    return sessionRef.current?.access_token ?? null;
  }, []);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      console.log('[AuthContext] Auth event:', event, nextSession ? 'has session' : 'no session');

      // Handle different auth events appropriately
      switch (event) {
        case 'INITIAL_SESSION':
          // INITIAL_SESSION with null just means no cached session yet
          // Wait for getSession() to confirm the true initial state
          if (nextSession) {
            updateSession(nextSession);
            initializedRef.current = true;
            setLoading(false);
          }
          // If null, don't update - let getSession() handle it
          break;

        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
          // These events always represent valid, fresh sessions
          updateSession(nextSession);
          initializedRef.current = true;
          setLoading(false);
          break;

        case 'SIGNED_OUT':
          // User explicitly signed out
          updateSession(null);
          initializedRef.current = true;
          setLoading(false);
          break;

        case 'USER_UPDATED':
          // User data changed but session should still be valid
          if (nextSession) {
            updateSession(nextSession);
          }
          break;

        default:
          // For any other events, update if we have a session
          if (nextSession) {
            updateSession(nextSession);
            initializedRef.current = true;
            setLoading(false);
          }
      }
    });

    // getSession() as fallback for initial state
    supabase.auth.getSession().then(({ data: { session: fetchedSession }, error }) => {
      if (!mounted) return;

      console.log('[AuthContext] getSession result:', fetchedSession ? 'has session' : 'no session', error ? `error: ${error.message}` : '');

      // Only use getSession result if we haven't been initialized by an auth event
      // OR if we have no session yet and getSession found one
      if (!initializedRef.current) {
        updateSession(fetchedSession);
        initializedRef.current = true;
        setLoading(false);
      } else if (fetchedSession && !sessionRef.current) {
        // We were initialized with null but getSession found a session
        updateSession(fetchedSession);
        setLoading(false);
      } else {
        // Just make sure loading is false
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [updateSession]);

  return (
    <AuthContext.Provider value={{ user, session, loading, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
};
