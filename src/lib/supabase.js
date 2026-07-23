import { createClient } from '@supabase/supabase-js'
import { safeLocalStorage } from './safeStorage'
import { authStorage } from './authStorage'

// URL + anon key are configurable so a preview deployment can point at a separate
// (non-production) Supabase project. When the env vars are unset, both fall back to the
// production literals, so production builds are byte-for-byte unchanged.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://wmtjgpxhjtbocsmutqqc.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdGpncHhoanRib2NzbXV0cXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTU5MTcsImV4cCI6MjA4NzQ3MTkxN30.IeeS2KToh7YPsKcVhFtojcX5fuwjAwEzIt5_RO09tQg'
// Derive the boot-cleanup storage key from the resolved project ref so it tracks whichever
// project is configured. For the production fallback URL this yields the identical value
// 'sb-wmtjgpxhjtbocsmutqqc-auth-token'.
const projectRef = supabaseUrl.replace(/^https?:\/\//, '').split('.')[0]
const STORAGE_KEY = `sb-${projectRef}-auth-token`

// Only strip truly corrupt storage — let Supabase handle expiry/refresh.
// Aggressive expiry checks here were wiping valid sessions (wrong shape or clock skew) and broke login redirects.
const raw = safeLocalStorage.getItem(STORAGE_KEY)
if (raw) {
  try {
    JSON.parse(raw)
  } catch {
    safeLocalStorage.removeItem(STORAGE_KEY)
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Recovery / magic links use hash fragments; must be parsed on first load.
    detectSessionInUrl: true,
    // Session persistence must survive restricted storage (Safari private mode) —
    // authStorage writes native localStorage when it works (normal mode is
    // byte-identical) and falls back to chunked SESSION COOKIES when the
    // native write throws, so the session survives reloads in a private
    // window (the 2026-07-22 dashboard→login bounce). Blocked cookies degrade
    // to in-memory for the page's lifetime, exactly the old behavior.
    storage: authStorage,
  },
})
