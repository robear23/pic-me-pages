/**
 * Patch supabase-js auth instance to prevent refresh-token storms.
 *
 * Why:
 * - Even with autoRefreshToken: false, supabase-js can still trigger refresh flows
 *   during concurrent session loads.
 * - Parallel refresh_token calls rotate tokens and revoke each other, then 429,
 *   and finally the SDK emits SIGNED_OUT.
 *
 * This patch:
 * - Makes the internal refresh-token call single-flight
 * - Stops and permanently disables any auto refresh loop
 */
export const patchSupabaseAuth = (auth: any) => {
  const authAny = auth as any;

  // Patch internal refresh-token call to be single-flight.
  if (!authAny.__lovable_refresh_single_flight_patched && typeof authAny._callRefreshToken === 'function') {
    authAny.__lovable_refresh_single_flight_patched = true;

    const original = authAny._callRefreshToken.bind(authAny);
    authAny.__lovable_original_call_refresh_token = original;
    authAny.__lovable_refresh_in_flight = null as Promise<any> | null;
    authAny.__lovable_last_refresh_finished_at = 0 as number;
    authAny.__lovable_last_refresh_promise = null as Promise<any> | null;

    authAny._callRefreshToken = (...args: any[]) => {
      if (authAny.__lovable_refresh_in_flight) return authAny.__lovable_refresh_in_flight;

      // Soft throttle: if something tries to refresh again immediately after finishing,
      // reuse the last result instead of spamming /token.
      const now = Date.now();
      if (
        authAny.__lovable_last_refresh_promise &&
        now - (authAny.__lovable_last_refresh_finished_at || 0) < 1500
      ) {
        return authAny.__lovable_last_refresh_promise;
      }

      authAny.__lovable_refresh_in_flight = Promise.resolve(original(...args))
        .catch((e: any) => {
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

  // Stop any running refresher.
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
