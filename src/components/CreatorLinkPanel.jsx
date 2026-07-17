import { useState } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'

/**
 * Creator-dashboard claim-link generator (Piece A, 2026-07-17): the same
 * first-name → shareable-link flow viewers get in ClaimWatch's share panel,
 * restyled in the dashboard card's palette. It calls the SAME
 * POST /api/invites/create-link — the creator's verified session replaces the
 * claimed-invite reference, and the server applies the same ownership and
 * quota rules it always has. No email is ever entered here; the only email
 * input in the product is the claim moment.
 */
export default function CreatorLinkPanel({ filmId, onCreated }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(null)
  const [copied, setCopied] = useState(false)

  const handleGenerate = async (e) => {
    e.preventDefault()
    const first = name.trim()
    if (!first) {
      setError('Enter their first name.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const result = await api.createInviteLink(first, {
        filmId,
        accessToken: session?.access_token || null,
        appUrl: window.location.origin,
      })
      setGenerated({ url: result.url, name: first })
      setName('')
      setCopied(false)
      onCreated?.()
    } catch (err) {
      setError(err.message || 'Could not create the link — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!generated?.url) return
    try {
      await navigator.clipboard.writeText(`I watched this and thought of you — ${generated.url}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="border border-border bg-bg-page p-4">
      <p className="mb-3 text-xs uppercase tracking-wider text-text-muted">Who is this film for?</p>
      <form onSubmit={handleGenerate} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor={`link-first-name-${filmId}`} className="sr-only">
          Their first name
        </label>
        <input
          id={`link-first-name-${filmId}`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Their first name"
          maxLength={50}
          className="w-full rounded-none border border-border bg-bg-card px-3 py-2.5 text-sm text-text sm:max-w-xs sm:py-2"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 cursor-pointer rounded-none bg-accent px-4 py-2 text-xs uppercase tracking-wider text-warm transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'One moment…' : 'Create their invitation'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
      {generated && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <p className="break-all text-sm text-text">{generated.url}</p>
          <p className="mt-2 text-sm italic text-text-muted">
            &ldquo;I watched this and thought of you &mdash; {generated.url}&rdquo;
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-3 cursor-pointer rounded-none border border-border px-4 py-2 text-xs uppercase tracking-wider text-text-muted transition-colors hover:border-text-muted hover:text-text"
          >
            {copied ? 'Copied' : 'Copy the message'}
          </button>
        </div>
      )}
    </div>
  )
}
