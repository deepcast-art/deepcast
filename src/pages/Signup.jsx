import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import DeepcastLogo from '../components/DeepcastLogo'

export default function Signup() {
  const [searchParams] = useSearchParams()
  const isCreator = searchParams.get('role') === 'creator'
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
      await signUp(email, password, fullName, isCreator ? 'creator' : 'viewer', firstName.trim(), lastName.trim())
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err.message || 'Account creation failed. Please try again.')
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
            {isCreator ? 'Creator signup' : 'Join Deepcast'}
          </h1>
          <p className="text-text-muted text-sm">
            {isCreator
              ? 'Share your films with the right audience.'
              : 'Unlock more invites and track your screenings.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in animate-delay-200">
          {error && (
            <div className="text-error text-sm text-center bg-error/10 rounded-none py-2 px-4">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
              Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="w-1/2 bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="First name"
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-1/2 bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="Last name"
              />
            </div>
          </div>

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
              minLength={6}
              className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="At least 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink text-warm font-medium rounded-none py-3 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-text-muted text-sm mt-8 animate-fade-in animate-delay-300">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:text-accent-hover transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
