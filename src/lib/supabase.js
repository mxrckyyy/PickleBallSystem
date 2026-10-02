/**
 * Supabase client (spec §1, §7).
 *
 * Public configuration only: project URL + anon key are the two values the
 * specification allows in the frontend. All server secrets (PayMongo,
 * Semaphore, service role) live exclusively in Edge Function secrets.
 *
 * Session storage is a custom in-memory adapter so that tokens are NEVER
 * written to localStorage (spec §7 — "Never store tokens in localStorage due
 * to XSS risk"). Trade-off: a full page reload clears the session and the
 * user must sign in again. See PROJECT_CONTEXT.md known issue J12.
 */
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function readConfig() {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  const isConfigured = Boolean(url && anonKey && /^https?:\/\//i.test(url));
  return { url, anonKey, isConfigured };
}

export const supabaseConfig = readConfig();

export const isSupabaseConfigured = supabaseConfig.isConfigured;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        storage: createMemoryStorage(),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'implicit',
      },
      realtime: {
        params: { eventsPerSecond: 5 },
      },
      global: {
        headers: { 'x-application-name': 'pickleball-booking' },
      },
    })
  : null;

/** Returns the configured client or throws a clear, actionable error. */
export function assertSupabase() {
  if (!supabase) {
    throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
  }
  return supabase;
}
