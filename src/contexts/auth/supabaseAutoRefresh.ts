import { supabase } from '@/integrations/supabase/clientSafe';

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

  // Patch internal refresh-token call to be single-flight.
  // Why: even with autoRefreshToken disabled, supabase-js can call its internal
  // refresh path during concurrent session loads (e.g., multiple requests on page load).
  // If those happen in parallel, it can spam /token (refresh_token), causing 429 and SIGNED_OUT.
  if (!authAny.__lovable_refresh_single_flight_patched && typeof authAny._callRefreshToken === 'function') {
    authAny.__lovable_refresh_single_flight_patched = true;

    const original = authAny._callRefreshToken.bind(authAny);
    authAny.__lovable_original_call_refresh_token = original;
    authAny.__lovable_refresh_in_flight = null as Promise<any> | null;
    authAny.__lovable_last_refresh_started_at = 0 as number;
    authAny.__lovable_last_refresh_finished_at = 0 as number;
    authAny.__lovable_last_refresh_promise = null as Promise<any> | null;

    authAny._callRefreshToken = (...args: any[]) => {
      // If a refresh is already running, reuse it.
      if (authAny.__lovable_refresh_in_flight) {
        return authAny.__lovable_refresh_in_flight;
      }

      // Soft throttle: if something tries to refresh again immediately after finishing,
      // reuse the last result instead of spamming /token.
      const now = Date.now();
      if (
        authAny.__lovable_last_refresh_promise &&
        now - (authAny.__lovable_last_refresh_finished_at || 0) < 1500
      ) {
        return authAny.__lovable_last_refresh_promise;
      }

      authAny.__lovable_last_refresh_started_at = now;
      authAny.__lovable_refresh_in_flight = Promise.resolve(original(...args))
        .catch((e: any) => {
          // Keep errors flowing to supabase-js (it decides how to handle),
          // but ensure we don't leave the in-flight latch stuck.
          throw e;
        })
        .finally(() => {
          authAny.__lovable_refresh_in_flight = null;
          authAny.__lovable_last_refresh_finished_at = Date.now();
        });

      authAny.__lovable_last_refresh_promise = authAny.__lovable_refresh_in_flight;
      return authAny.__lovable_refresh_in_flight;
    };
  }

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
