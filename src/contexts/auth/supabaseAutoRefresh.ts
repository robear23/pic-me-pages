import { supabase } from '@/integrations/supabase/clientSafe';
import { patchSupabaseAuth } from '@/integrations/supabase/patchAuth';

/**
 * Disables Supabase-js built-in token auto-refresh.
 *
 * Why: In some environments the built-in refresher can spam refresh_token requests,
 * which rotates refresh tokens, triggers 429 rate limits, and forces SIGNED_OUT.
 *
 * We keep refresh behavior under our own single-flight scheduler in AuthContext.
 */
export const disableSupabaseAutoRefresh = () => {
  patchSupabaseAuth((supabase as any).auth);
};
