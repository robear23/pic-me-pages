import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";
import { createSupabaseAuthStorage } from "./authStorage";
import { patchSupabaseAuth } from "./patchAuth";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// IMPORTANT:
// We intentionally do NOT use the default `sb-<project>-auth-token` storage key.
// If *any* other Supabase client instance exists in the bundle (even accidentally),
// sharing the same storage key can lead to dueling refresh-token requests, 429s,
// and forced SIGNED_OUT.
export const SUPABASE_AUTH_STORAGE_KEY = 'colorstory_auth_v2';

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
    storage: createSupabaseAuthStorage(SUPABASE_AUTH_STORAGE_KEY),
    persistSession: true,
    autoRefreshToken: false,
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    detectSessionInUrl: true,
  },
});

// Patch auth immediately (as early as possible) to prevent refresh storms during startup.
patchSupabaseAuth((supabase as any).auth);
