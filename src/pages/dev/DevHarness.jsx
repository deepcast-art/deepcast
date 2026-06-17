import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DEV_HARNESS_ENABLED } from '../../lib/devHarness'

/**
 * DEV-ONLY test harness (v1: token-only jumps). Lazy-loaded and route-gated behind
 * DEV_HARNESS_ENABLED, so this file is never part of a production bundle.
 *
 * It does not seed or fake state — it reuses existing levers on a real invite token:
 *   - Fresh entry      → /i/:token            (signs out first)
 *   - Pre-screening    → /i/:token?devStage=prologue    (gated effect in InviteScreening)
 *   - Player (resume)  → /i/:token?play=1&t=N           (existing directPlay)
 *   - Completion       → /i/:token?devStage=completion  (gated effect in InviteScreening)
 *   - Pass-it-on       → /i/:token  with location.state.showShare = true
 *
 * Authenticated dashboard / returning-viewer jumps are intentionally NOT in v1.
 */
const SACRED_PAUSE_FILM_ID = '7c42093d-d5eb-4a38-a9fa-d28ca41d7b0f'

export default function DevHarness() {
  const navigate = useNavigate()
  const [films, setFilms] = useState([])
  const [filmId, setFilmId] = useState(SACRED_PAUSE_FILM_ID)
  const [tokens, setTokens] = useState([])
  const [tokensNote, setTokensNote] = useState('')
  const [manualToken, setManualToken] = useState('')
  const [resumeSec, setResumeSec] = useState(30)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('films')
        .select('id, title')
        .order('created_at', { ascending: true })
      if (!cancelled && data) setFilms(data)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!filmId) return undefined
    let cancelled = false
    ;(async () => {
      setTokensNote('Loading…')
      const { data, error } = await supabase
        .from('invites')
        .select('token, recipient_email, recipient_name, status, created_at')
        .eq('film_id', filmId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (cancelled) return
      if (error) {
        setTokens([])
        setTokensNote(`Could not read invites (${error.message}). Paste a token below.`)
        return
      }
      setTokens(data || [])
      setTokensNote(
        (data || []).length
          ? ''
          : 'No invite tokens readable for this film (RLS may hide them). Paste a token below.'
      )
    })()
    return () => {
      cancelled = true
    }
  }, [filmId])

  // Defense in depth: the route is already gated, but never render if the gate is false.
  if (!DEV_HARNESS_ENABLED) return null

  const freshEntry = async (t) => {
    await supabase.auth.signOut().catch(() => {})
    navigate(`/i/${t}`)
  }
  const jumps = (t) => [
    ['Fresh entry (sign out)', () => freshEntry(t)],
    ['Pre-screening prologue', () => navigate(`/i/${t}?devStage=prologue`)],
    ['Player (resume @Ns)', () => navigate(`/i/${t}?play=1&t=${Math.max(0, Number(resumeSec) || 0)}`)],
    ['Completion / thank-you', () => navigate(`/i/${t}?devStage=completion`)],
    ['Pass-it-on', () => navigate(`/i/${t}`, { state: { showShare: true } })],
  ]

  const btn =
    'px-2 py-1 text-xs border border-border rounded-none bg-bg-card hover:bg-accent hover:text-warm transition-colors'

  const renderJumpButtons = (token) => (
    <div className="flex flex-wrap gap-2">
      {jumps(token).map(([label, fn]) => (
        <button key={label} type="button" onClick={fn} className={btn}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="min-h-dvh bg-bg-page p-6 text-text">
      <div className="mx-auto max-w-3xl">
        <p className="mb-1 text-xs uppercase tracking-widest text-error">DEV HARNESS — not in production</p>
        <h1 className="mb-6 font-display text-2xl">Jump to a viewer state (token-only, v1)</h1>

        <label className="mb-2 block text-xs uppercase tracking-wider text-text-muted">Film</label>
        <select
          value={filmId}
          onChange={(e) => setFilmId(e.target.value)}
          className="mb-6 w-full rounded-none border border-border bg-bg-card px-3 py-2 text-sm"
        >
          {!films.some((f) => f.id === SACRED_PAUSE_FILM_ID) && (
            <option value={SACRED_PAUSE_FILM_ID}>A Sacred Pause (default)</option>
          )}
          {films.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title} — {f.id}
            </option>
          ))}
        </select>

        <div className="mb-6 flex items-center gap-2">
          <label className="text-xs uppercase tracking-wider text-text-muted">Resume at (seconds)</label>
          <input
            type="number"
            value={resumeSec}
            min={0}
            onChange={(e) => setResumeSec(e.target.value)}
            className="w-24 rounded-none border border-border bg-bg-card px-2 py-1 text-sm"
          />
        </div>

        <h2 className="mb-3 text-xs uppercase tracking-wider text-text-muted">Existing invite tokens</h2>
        {tokensNote && <p className="mb-3 text-xs text-text-muted">{tokensNote}</p>}
        <div className="mb-8 space-y-4">
          {tokens.map((t) => (
            <div key={t.token} className="border border-border bg-bg-card p-3">
              <div className="mb-2 text-xs text-text-muted">
                {(t.recipient_name || t.recipient_email || '—')} · {t.status} ·{' '}
                <span className="font-mono">{t.token}</span>
              </div>
              {renderJumpButtons(t.token)}
            </div>
          ))}
        </div>

        <h2 className="mb-2 text-xs uppercase tracking-wider text-text-muted">Or paste a token</h2>
        <input
          type="text"
          value={manualToken}
          onChange={(e) => setManualToken(e.target.value)}
          placeholder="invite token"
          className="mb-3 w-full rounded-none border border-border bg-bg-card px-3 py-2 font-mono text-sm"
        />
        {manualToken.trim() && renderJumpButtons(manualToken.trim())}
      </div>
    </div>
  )
}
