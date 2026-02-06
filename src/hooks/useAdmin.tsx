import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/clientSafe";
import { useAuth } from "@/contexts/AuthContext";

export function useAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAdminStatus = async () => {
      if (authLoading) return;

      if (!user) {
        if (!cancelled) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);

        // Use a SECURITY DEFINER RPC to avoid any client-side/RLS edge cases.
        const { data, error } = await supabase.rpc('has_role', {
          _user_id: user.id,
          _role: 'admin',
        });

        if (error) {
          console.error('Error checking admin status (has_role):', error);
        }

        if (!cancelled) setIsAdmin(Boolean(data));
      } catch (error) {
        console.error('Error checking admin status:', error);
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAdminStatus();

    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  return { isAdmin, loading };
}

