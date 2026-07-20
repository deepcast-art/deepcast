/**
 * V5 dashboard share modal — the LINK flow (shares are links, not emails).
 * Same POST /api/invites/create-link as the watch page's panel and the
 * creator's link panel; the server applies identity, lineage, and per-film
 * ticket rules:
 *   - signed-in viewer → verified session token (+ parentInviteId lineage)
 *   - accountless claimant → their claimed invite id IS the identity
 * No email is ever entered here; the only email input in the product is the
 * claim moment. Founder-approved copy verbatim.
 */
import { useState } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'

export default function ShareLinkModal({
  open,
  onClose,
  filmId,
  isClaimant,
  claimedInviteId,
  parentInviteId,
  onCreated,
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(null)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const reset = () => {
    setName('')
    setError('')
    setGenerated(null)
    setCopied(false)
  }

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
      let accessToken = null
      if (!isClaimant) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        accessToken = session?.access_token || null
      }
      const result = await api.createInviteLink(first, {
        filmId,
        claimedInviteId: isClaimant ? claimedInviteId : null,
        accessToken,
        appUrl: window.location.origin,
        parentInviteId: !isClaimant ? parentInviteId || null : null,
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
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/90 p-5 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Share this film"
    >
      <div className="relative w-full max-w-lg border border-mist/[0.16] bg-ink-2 p-8 sm:p-10">
        <button
          type="button"
          onClick={() => {
            reset()
            onClose()
          }}
          aria-label="Close"
          className="absolute right-5 top-5 min-h-[44px] min-w-[44px] touch-manipulation font-sans text-[0.6875rem] uppercase tracking-[0.22em] text-smoke transition-colors hover:text-mist"
        >
          Close
        </button>

        <p className="font-sans text-[0.625rem] uppercase tracking-[0.3em] text-smoke">
          Who is this film for?
        </p>
        {/* Founder-approved verbatim — the constraint line's primary home. */}
        <p className="mt-4 font-serif-v3 text-sm italic leading-relaxed text-smoke">
          This film reached you because someone thought of you. No algorithm, no feed. Films here
          pass through human hands only.
        </p>

        <form onSubmit={handleGenerate} className="mt-7 flex flex-col gap-4">
          <label htmlFor="v5-share-first-name" className="sr-only">
            Their first name
          </label>
          <input
            id="v5-share-first-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their first name"
            maxLength={50}
            autoFocus
            className="w-full border-b border-mist/20 bg-transparent px-1 py-3 text-center font-serif-v3 text-lg italic text-mist placeholder-mist/30 focus:border-gold/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full border border-gold bg-gold px-4 py-4 font-sans text-[0.8125rem] uppercase tracking-[0.26em] text-ink transition-colors duration-300 hover:bg-transparent hover:text-gold-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'One moment…' : 'Create their invitation'}
          </button>
        </form>
        {error && <p className="mt-3 font-sans text-sm text-error">{error}</p>}

        {generated && (
          <div className="mt-7 border-t border-mist/[0.12] pt-6">
            <p className="break-all font-sans text-sm text-mist">{generated.url}</p>
            <p className="mt-3 font-serif-v3 text-base italic text-smoke">
              &ldquo;I watched this and thought of you &mdash; {generated.url}&rdquo;
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-4 border border-mist/25 px-5 py-2.5 font-sans text-[0.6875rem] uppercase tracking-[0.22em] text-smoke transition-colors hover:border-gold hover:text-gold-soft"
            >
              {copied ? 'Copied' : 'Copy the message'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
