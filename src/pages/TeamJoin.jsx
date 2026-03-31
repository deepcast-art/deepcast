import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import DeepcastLogo from '../components/DeepcastLogo'

export default function TeamJoin() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setLoadError('This link is missing its invitation token. Ask your filmmaker to send a new invite.')
      setLoading(false)
      return
    }
    api
      .getTeamInviteInfo(token)
      .then((r) => {
        setInfo(r)
        setFullName(r.invitedName || '')
      })
      .catch((e) => setLoadError(e.message || 'This invitation is not valid.'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!info?.email) {
      setError('Invitation data is missing. Reload the page or use the link from your email.')
      return
    }
    setSubmitting(true)
    try {
      await api.registerTeamMember(token, password, fullName.trim() || null)
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: info.email,
        password,
      })
      if (signErr) throw signErr
      if (info.email) localStorage.setItem('deepcast:last_email', info.email)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Could not complete registration.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-bg-page">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex justify-center hover:opacity-80 transition-opacity">
            <DeepcastLogo variant="ink" className="h-8" />
          </Link>
          <h1 className="text-2xl font-display mt-6 text-text">Join the team</h1>
          <p className="text-text-muted text-sm mt-2">
            Set your password to access the dashboard and send screening invites.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <p className="text-error text-sm text-center">{loadError}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs uppercase tracking-wider text-text-muted mb-2">
                Email
              </label>
              <p className="text-sm text-text">{info?.email}</p>
            </div>
            <div>
              <label
                htmlFor="team-join-name"
                className="block text-xs uppercase tracking-wider text-text-muted mb-2"
              >
                Your name
              </label>
              <input
                id="team-join-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
                placeholder="First and last name"
              />
            </div>
            <div>
              <label
                htmlFor="team-join-password"
                className="block text-xs uppercase tracking-wider text-text-muted mb-2"
              >
                Password
              </label>
              <input
                id="team-join-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-card border border-border rounded-none px-4 py-3 text-sm text-text focus:outline-none focus:border-accent"
                placeholder="At least 8 characters"
              />
            </div>
            {error && <p className="text-error text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-ink text-warm text-sm font-medium rounded-none py-3 hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Creating account…' : 'Create account & go to dashboard'}
            </button>
          </form>
        )}

        <p className="text-center text-text-muted text-xs mt-10">
          <Link to="/login" className="hover:text-text transition-colors">
            Already have an account? Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
