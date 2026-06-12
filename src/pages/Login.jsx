import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { checkEmail } from '../lib/emailCheck'
import DeepcastLogo from '../components/DeepcastLogo'
import MvpVersionLabel from '../components/MvpVersionLabel'
import { safeLocalStorage } from '../lib/safeStorage'
import { consumeAuthLinkError } from '../lib/authLinkError'

export default function Login() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [linkSending, setLinkSending] = useState(false)
  const [linkSent, setLinkSent] = useState(false)
  /** Password is the secondary option (D1: creators/team keep it); hidden until requested. */
  const [showPassword, setShowPassword] = useState(false)
  /** Used/expired magic link (captured at boot in main.jsx, one-shot): explain it
   *  instead of a silent plain login page. Cleared once a fresh link is sent. */
  const [expiredLinkNotice, setExpiredLinkNotice] = useState(() => Boolean(consumeAuthLinkError()))
  const { signIn, sendSignInLink, user, profile, loading: authLoading, isRecovery } = useAuth()

  // Same-device return: a valid stored session lands straight on the dashboard.
  useEffect(() => {
    if (!authLoading && user && profile && !isRecovery) {
      navigate('/dashboard', { replace: true })
    }
  }, [authLoading, user, profile, isRecovery, navigate])

  useEffect(() => {
    if (email) return
    const paramEmail = searchParams.get('email')
    const storedEmail =
      safeLocalStorage.getItem('deepcast:last_email') || safeLocalStorage.getItem('seen:last_email')
    const prefill = paramEmail || storedEmail
    if (prefill) setEmail(prefill)
  }, [email, searchParams])

  // PRIMARY: passwordless one-tap sign-in link.
  const handleSendLink = async (e) => {
    e.preventDefault()
    setError('')
    const { ok, email: normalized } = checkEmail(email)
    if (!ok) {
      setError('Enter a valid email address.')
      return
    }
    setLinkSending(true)
    try {
      safeLocalStorage.setItem('deepcast:last_email', normalized)
      await sendSignInLink(normalized, '/dashboard')
      setLinkSent(true)
      setExpiredLinkNotice(false)
    } catch (err) {
      setError(err.message || 'Could not send a sign-in link. Please try again.')
    } finally {
      setLinkSending(false)
    }
  }

  // SECONDARY: password sign-in (creators / team members).
  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (email) safeLocalStorage.setItem('deepcast:last_email', email)
      const result = await signIn(email, password)
      const role = result?.profile?.role
      window.location.href =
        role === 'creator' || role === 'team_member' || role === 'viewer'
          ? '/dashboard'
          : '/profile'
    } catch (err) {
      setError(err.message || 'Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  if (linkSent) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 sm:px-6">
        <div className="w-full max-w-sm min-w-0 text-center animate-fade-in">
          <Link to="/" className="inline-flex justify-center hover:opacity-80 transition-opacity">
            <DeepcastLogo variant="ink" className="h-8" />
          </Link>
          <h1 className="text-2xl font-display mt-6 mb-2">Check your inbox</h1>
          <p className="text-text-muted text-sm leading-relaxed">
            If an account exists for <span className="text-text">{email}</span>, we’ve emailed a
            one-tap sign-in link. Open it on this device to continue.
          </p>
          <button
            type="button"
            onClick={() => { setLinkSent(false); setPassword(''); setShowPassword(false) }}
            className="mt-8 text-xs text-text-muted uppercase tracking-wider hover:text-text transition-colors"
          >
            Use a different email
          </button>
        </div>
        <MvpVersionLabel className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-6">
      <div className="w-full max-w-sm min-w-0">
        <div className="text-center mb-10 animate-fade-in">
          <Link to="/" className="inline-flex justify-center hover:opacity-80 transition-opacity">
            <DeepcastLogo variant="ink" className="h-8" />
          </Link>
          <h1 className="text-2xl font-display mt-6 mb-2">Welcome back</h1>
          <p className="text-text-muted text-sm">Enter your email and we’ll send a sign-in link.</p>
        </div>

        <form onSubmit={handleSendLink} className="space-y-5 animate-fade-in animate-delay-300">
          {expiredLinkNotice && (
            <div className="text-accent text-sm text-center leading-relaxed bg-accent/10 rounded-none py-3 px-4">
              That sign-in link has already been used or expired — they only work once. Enter
              your email and we&apos;ll send you a fresh one.
            </div>
          )}
          {error && (
            <div className="text-error text-sm text-center bg-error/10 rounded-none py-2 px-4">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={linkSending}
            className="w-full min-h-[44px] touch-manipulation bg-ink text-warm font-medium rounded-none py-3 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            {linkSending ? 'Sending link…' : 'Email me a sign-in link'}
          </button>
        </form>

        {/* SECONDARY: password sign-in for creators / team members. */}
        <div className="mt-8 pt-6 border-t border-border animate-fade-in animate-delay-300">
          {!showPassword ? (
            <button
              type="button"
              onClick={() => setShowPassword(true)}
              className="w-full text-center text-xs text-text-muted uppercase tracking-wider hover:text-text transition-colors"
            >
              Sign in with a password instead
            </button>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs text-text-muted uppercase tracking-wider">
                    Password
                  </label>
                  <Link
                    to="/reset-password"
                    className="text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                  placeholder="Your password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] touch-manipulation border border-ink text-ink font-medium rounded-none py-3 text-sm hover:bg-ink hover:text-warm transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Signing in...' : 'Sign in with password'}
              </button>
            </form>
          )}
        </div>
      </div>
      <MvpVersionLabel className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2" />
    </div>
  )
}
