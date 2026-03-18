import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'

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

  const [debug, setDebug] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setDebug('')
    setLoading(true)

    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
      setDebug('Calling signUp...')
      const result = await signUp(email, password, fullName, isCreator ? 'creator' : 'viewer', firstName.trim(), lastName.trim())
      setDebug('signUp returned: user=' + (result?.user?.id || 'none') + ' profile=' + (result?.profile?.name || 'none'))
      window.location.href = '/login'
    } catch (err) {
      setError(err.message || 'Account creation failed. Please try again.')
      setDebug('Error caught: ' + String(err))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10 animate-fade-in">
          <Link to="/" className="text-accent text-sm tracking-[0.3em] uppercase">
            Deepcast
          </Link>
          <h1 className="text-2xl font-light mt-6 mb-2">
            {isCreator ? 'Creator signup' : 'Join Deepcast'}
          </h1>
          <p className="text-text-muted text-sm">
            {isCreator
              ? 'Share your films with the right audience.'
              : 'Unlock more invites and track your screenings.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in animate-delay-200">
          {debug && (
            <div className="text-accent text-xs text-center bg-accent/10 rounded-lg py-2 px-4 break-all">
              {debug}
            </div>
          )}
          {error && (
            <div className="text-error text-sm text-center bg-error/10 rounded-lg py-2 px-4 break-all">
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
                className="w-1/2 bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                placeholder="First name"
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-1/2 bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
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
              className="w-full bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
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
              className="w-full bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              placeholder="At least 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-bg font-medium rounded-lg py-3 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
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
