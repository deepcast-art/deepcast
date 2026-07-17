import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'

const norm = (v) => String(v ?? '').trim().toLowerCase()

/**
 * Delete-with-splice confirm surface (Piece C, 2026-07-17). Opens from the
 * quiet "Remove" affordance on an admin-table row and shows the SERVER's
 * preview — who re-points where, what gets deleted, whether the account
 * goes — before anything happens. Person targets must type the email back
 * (the server re-verifies independently); unclaimed links confirm with a
 * click (approved — nothing meaningful to type, one dead row).
 *
 * Same fixed-position anchoring and scroll/outside-click closing as the
 * ticket popover (including the trailing-scroll grace after open).
 */
export default function RemovePersonPopover({ anchorRect, filmId, target, onDeleted, onClose }) {
  const ref = useRef(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const away = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const openedAt = Date.now()
    const anyScroll = () => {
      if (Date.now() - openedAt > 300) onClose()
    }
    document.addEventListener('pointerdown', away)
    window.addEventListener('scroll', anyScroll, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('scroll', anyScroll, true)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } = {} } = await supabase.auth.getSession()
        const payload =
          target.kind === 'ticket'
            ? { filmId, inviteId: target.inviteId }
            : { filmId, email: target.email }
        const p = await api.adminDeletePreview(payload, session?.access_token)
        if (!cancelled) setPreview(p)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not build the preview')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filmId, target])

  const handleDelete = async () => {
    setBusy(true)
    setError('')
    try {
      const { data: { session } = {} } = await supabase.auth.getSession()
      const payload =
        target.kind === 'ticket'
          ? { filmId, inviteId: target.inviteId }
          : { filmId, email: target.email, confirmEmail: typed }
      await api.adminDeleteExecute(payload, session?.access_token)
      onDeleted()
    } catch (err) {
      setError(err.message || 'Could not complete the deletion')
      setBusy(false)
    }
  }

  if (!anchorRect) return null
  // Open below the anchor, or flip above it when the viewport bottom is
  // close — a fixed element below the fold can never be scrolled into view.
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const style = {
    position: 'fixed',
    ...(spaceBelow < 320
      ? { bottom: window.innerHeight - anchorRect.top + 6 }
      : { top: anchorRect.bottom + 6 }),
    left: Math.max(8, Math.min(anchorRect.right - 300, window.innerWidth - 308)),
    width: 300,
    zIndex: 40,
  }

  const confirmReady =
    target.kind === 'ticket' || (preview && norm(typed) === norm(preview.email))

  return (
    <div
      ref={ref}
      style={style}
      className="border border-border bg-bg-card p-3 text-left text-xs text-text-muted shadow-lg"
    >
      <p className="mb-2 text-text">
        Remove {target.kind === 'ticket' ? `the unclaimed link for ${target.name}` : target.name}
      </p>

      {error && <p className="mb-2 text-[11px] text-error">{error}</p>}

      {!preview && !error && <p className="text-[11px]">Checking what this would touch…</p>}

      {preview && preview.kind === 'ticket' && (
        <p className="mb-3 text-[11px] leading-relaxed">{preview.summary}</p>
      )}

      {preview && preview.kind === 'person' && (
        <div className="mb-3 flex flex-col gap-1 text-[11px] leading-relaxed">
          {preview.repoint.length > 0 ? (
            preview.repoint.map((r, i) => (
              <p key={i}>
                <span className="text-text">{r.child}</span> re-points to{' '}
                {r.toParentId ? 'their grandparent inviter' : 'the film itself'} and stays.
              </p>
            ))
          ) : (
            <p>No one needs re-pointing.</p>
          )}
          <p>
            Deletes {preview.inviteCount} invite row{preview.inviteCount === 1 ? '' : 's'} and{' '}
            {preview.watchSessionCount} watch session{preview.watchSessionCount === 1 ? '' : 's'}.
          </p>
          <p>
            {preview.accountDeleted
              ? 'Their account is deleted too.'
              : preview.accountKeptReason || 'No account to delete.'}
          </p>
        </div>
      )}

      {preview && preview.kind === 'person' && (
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Type ${preview.email} to confirm`}
          className="mb-2 w-full rounded-none border border-border bg-bg-page px-2 py-1.5 text-[11px] text-text"
        />
      )}

      {preview && (
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !confirmReady}
            onClick={handleDelete}
            className="cursor-pointer rounded-none border border-error/50 px-3 py-1 text-[10px] uppercase tracking-wider text-error transition-colors hover:bg-error/10 disabled:cursor-default disabled:opacity-40"
          >
            {busy ? 'Removing…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}
