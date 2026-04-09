import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import DeepcastLogo from '../components/DeepcastLogo'

function formatResetRequestError(err) {
  const msg = (err?.message || '').trim()
  if (!msg) return 'Could not send reset email. Try again in a moment.'
  if (/rate limit|too many requests|429/i.test(msg)) {
    return 'Too many attempts. Wait a few minutes, then try again.'
  }
  if (/invalid email|valid email/i.test(msg)) {
    return 'Enter a valid email address.'
  }
  return msg
}

export default function ResetPassword() {
  const { isRecovery, resetPassword, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [updated, setUpdated] = useState(false)

  useEffect(() => {
    const stored =
      localStorage.getItem('deepcast:last_email') || localStorage.getItem('seen:last_email')
    if (stored && !email) setEmail(stored)
  }, [])

  const handleRequestReset = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      setError(formatResetRequestError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await updatePassword(newPassword)
      await signOut().catch(() => {})
      setUpdated(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setError(err.message || 'Could not update password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10 animate-fade-in">
          <Link to="/" className="inline-flex justify-center hover:opacity-80 transition-opacity">
            <DeepcastLogo variant="ink" className="h-8" />
          </Link>
          <h1 className="text-2xl font-display mt-6 mb-2">
            {isRecovery ? 'Set new password' : 'Reset your password'}
          </h1>
          <p className="text-text-muted text-sm">
            {isRecovery
              ? 'Choose a new password for your account.'
              : 'We\u2019ll email you a link to choose a new password.'}
          </p>
        </div>

        {updated ? (
          <div className="text-center animate-fade-in">
            <p className="text-accent text-sm mb-4">Password updated successfully.</p>
            <p className="text-text-muted text-sm">Redirecting to sign in\u2026</p>
          </div>
        ) : sent ? (
          <div className="text-center animate-fade-in space-y-4">
            <p className="text-text text-sm leading-relaxed">
              If an account exists for{' '}
              <span className="font-medium text-warm">{email.trim()}</span>, you&apos;ll get an email
              with a reset link shortly.
            </p>
            <p className="text-text-muted text-sm leading-relaxed">
              Check spam and promotions folders. Make sure this is the same address you used to sign
              up or accept an invitation — otherwise no message will be sent.
            </p>
            <p className="text-text-muted text-sm mb-2">
              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-accent hover:text-accent-hover transition-colors underline"
              >
                Use a different email
              </button>
              {' · '}
              <Link to="/login" className="text-text-muted hover:text-text transition-colors">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : isRecovery ? (
          <form onSubmit={handleUpdatePassword} className="space-y-5 animate-fade-in">
            {error && (
              <div className="text-error text-sm text-center bg-error/10 rounded-none py-2 px-4">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="Repeat new password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ink text-warm font-medium rounded-none py-3 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Updating\u2026' : 'Update password'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRequestReset} className="space-y-5 animate-fade-in">
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
              <p className="mt-2 text-xs text-text-muted leading-relaxed">
                Use the exact email from your Deepcast account (sign-up or invitation). If that address
                doesn&apos;t have an account yet, you won&apos;t receive a reset email.
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ink text-warm font-medium rounded-none py-3 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Sending\u2026' : 'Send reset link'}
            </button>
            <p className="text-center text-sm text-text-muted">
              <Link to="/login" className="text-accent hover:text-accent-hover transition-colors">
                &larr; Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
