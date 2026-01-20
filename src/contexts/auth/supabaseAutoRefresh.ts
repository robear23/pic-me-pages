import { supabase } from '@/integrations/supabase/client';

/**
 * Disables Supabase-js built-in token auto-refresh.
 *
 * Why: In some environments the built-in refresher can spam refresh_token requests,
 * which rotates refresh tokens, triggers 429 rate limits, and forces SIGNED_OUT.
 *
 * We keep refresh behavior under our own single-flight scheduler in AuthContext.
 */
export const disableSupabaseAutoRefresh = () => {
  const authAny = supabase.auth as any;

  try {
    authAny.stopAutoRefresh?.();
  } catch {
    // ignore
  }

  // Some internal code paths can restart auto refresh. Permanently no-op it.
  if (!authAny.__lovable_no_auto_refresh_patched && typeof authAny.startAutoRefresh === 'function') {
    authAny.__lovable_no_auto_refresh_patched = true;
    authAny.__lovable_original_start_auto_refresh = authAny.startAutoRefresh.bind(authAny);
    authAny.startAutoRefresh = () => {
      // no-op
    };
  }
};
