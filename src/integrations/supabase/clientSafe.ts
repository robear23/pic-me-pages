import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Supabase client with token auto-refresh permanently disabled.
 *
 * Why: autoRefreshToken can trigger refresh storms in certain browser environments
 * (multiple concurrent refresh_token requests), leading to 429s and forced SIGNED_OUT.
 *
 * We manage refresh in a single place (AuthContext) instead.
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: true,
  },
});
