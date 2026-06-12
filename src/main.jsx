import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { captureAuthLinkErrorFromLocation } from './lib/authLinkError'
import './fonts.css'
import './index.css'
import App from './App.jsx'

// A used/expired magic link arrives as an error hash with no session; the route guard's
// redirect strips the hash, so capture it BEFORE React renders. The login page then
// explains it instead of failing silently.
captureAuthLinkErrorFromLocation()

// Supabase recovery emails often redirect to Site URL root with tokens in the hash. The reset form
// lives at /reset-password — rewrite before React so the hash is parsed on the correct route.
if (typeof window !== 'undefined') {
  try {
    const { pathname, hash } = window.location
    if (
      hash &&
      (hash.includes('type=recovery') || hash.includes('type%3Drecovery')) &&
      pathname !== '/reset-password'
    ) {
      window.history.replaceState(window.history.state, '', `/reset-password${hash}`)
    }
  } catch {
    /* ignore */
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <div className="min-h-dvh overflow-x-hidden">
      <div className="dc-tactile-grain" aria-hidden />
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </div>
  </StrictMode>,
)
