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

  // Tracks whether we've already received a *non-null* session via an auth event.
  // This prevents a late getSession() result from overwriting a fresh session,
  // while still allowing getSession() to establish the initial session.
  const hasNonNullSessionEventRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // Avoid ending "loading" due to an INITIAL_SESSION event with a null session;
      // getSession() will resolve shortly and establish the true initial state.
      if (event === 'INITIAL_SESSION' && !nextSession) {
        return;
      }

      if (nextSession?.access_token) {
        hasNonNullSessionEventRef.current = true;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;

      // If we already got a real session from an auth event, don't let a late
      // getSession() call overwrite it with a null/older value.
      if (hasNonNullSessionEventRef.current && !session) {
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
