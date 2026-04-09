import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import './fonts.css'
import './index.css'
import App from './App.jsx'

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
