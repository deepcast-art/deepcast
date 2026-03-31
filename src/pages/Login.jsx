import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import DeepcastLogo from '../components/DeepcastLogo'

export default function Login() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()

  useEffect(() => {
    if (email) return
    const paramEmail = searchParams.get('email')
    const storedEmail =
      localStorage.getItem('deepcast:last_email') || localStorage.getItem('seen:last_email')
    const prefill = paramEmail || storedEmail
    if (prefill) setEmail(prefill)
  }, [email, searchParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (email) localStorage.setItem('deepcast:last_email', email)
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10 animate-fade-in">
          <Link to="/" className="inline-flex justify-center hover:opacity-80 transition-opacity">
            <DeepcastLogo variant="ink" className="h-8" />
          </Link>
          <h1 className="text-2xl font-display mt-6 mb-2">Welcome back</h1>
          <p className="text-text-muted text-sm">Sign in to your account.</p>
        </div>

        <div className="mb-6 text-center animate-fade-in animate-delay-200">
          <p className="text-text-muted text-sm">
            New here?{' '}
            <Link
              to="/signup?role=creator"
              className="text-accent hover:text-accent-hover transition-colors"
            >
              Filmmaker signup
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in animate-delay-300">
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
              className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink text-warm font-medium rounded-none py-3 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

      </div>
    </div>
  )
}
