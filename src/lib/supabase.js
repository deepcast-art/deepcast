import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wmtjgpxhjtbocsmutqqc.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdGpncHhoanRib2NzbXV0cXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTU5MTcsImV4cCI6MjA4NzQ3MTkxN30.IeeS2KToh7YPsKcVhFtojcX5fuwjAwEzIt5_RO09tQg'
const STORAGE_KEY = 'sb-wmtjgpxhjtbocsmutqqc-auth-token'

// Pre-validate stored session before Supabase auto-refresh tries to use it
try {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    const parsed = JSON.parse(raw)
    const expiresAt = parsed?.expires_at
    // If token is expired or malformed, remove it so Supabase doesn't choke
    if (!expiresAt || expiresAt * 1000 < Date.now()) {
      localStorage.removeItem(STORAGE_KEY)
    }
  }
} catch {
  localStorage.removeItem(STORAGE_KEY)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
