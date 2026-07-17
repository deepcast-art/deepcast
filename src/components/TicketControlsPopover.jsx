import { useEffect, useRef, useState } from 'react'

/**
 * Ticket-controls popover (Piece B, 2026-07-17): the owner's per-person
 * wallet control on the admin people table.
 *
 * - TOP-UP: [−]/[+] accumulate a visible pending amount ("+4"); nothing is
 *   applied until the single Give button commits it in ONE server call.
 *   Pending can't go below zero; closing without confirming discards it.
 * - UNLIMITED: a sliding-pill toggle. Flipping asks a one-line inline
 *   confirm before applying; turning it off returns the person to their
 *   existing counted balance (the server never resets it).
 *
 * Anchored position: fixed, because the table scrolls inside its own
 * overflow container which would clip an absolute child. Closes on outside
 * click or any scroll (both discard pending state).
 */
export default function TicketControlsPopover({
  anchorRect,
  firstName,
  status, // { unlimited, ticketsLeft, controllable, reason }
  busy,
  error,
  onGrant, // (amount) => Promise
  onSetUnlimited, // (bool) => Promise
  onClose,
}) {
  const ref = useRef(null)
  const [pending, setPending] = useState(0)
  const [confirmUnlimited, setConfirmUnlimited] = useState(null) // null | true | false (the value being confirmed)

  useEffect(() => {
    const away = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    // Scroll closes the popover (its fixed anchor would drift) — but trailing
    // scroll events from the click that OPENED it can arrive asynchronously
    // (momentum / scroll-into-view), so the first beat after mount is ignored.
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

  if (!anchorRect) return null
  const style = {
    position: 'fixed',
    top: anchorRect.bottom + 6,
    left: Math.max(8, Math.min(anchorRect.right - 232, window.innerWidth - 240)),
    width: 232,
    zIndex: 40,
  }

  const balanceLine = status.unlimited ? '∞' : `${status.ticketsLeft ?? 0} left`

  return (
    <div
      ref={ref}
      style={style}
      className="border border-border bg-bg-card p-3 text-left text-xs text-text-muted shadow-lg"
    >
      <p className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-text">{firstName}</span>
        <span className="text-[11px]">
          {balanceLine}
          {pending > 0 && <span className="ml-1 text-accent">+{pending}</span>}
        </span>
      </p>

      {!status.controllable ? (
        <p className="text-[11px] text-text-muted/70">{status.reason || 'Not adjustable'}</p>
      ) : (
        <>
          {/* Top-up: accumulate, then one confirm = one server call. */}
          {!status.unlimited && (
            <div className="mb-3 flex items-center gap-2">
              <span className="mr-auto text-[10px] uppercase tracking-wider">Tickets</span>
              <button
                type="button"
                onClick={() => setPending((p) => Math.max(0, p - 1))}
                disabled={busy || pending === 0}
                aria-label="One ticket fewer"
                className="h-7 w-7 cursor-pointer rounded-none border border-border text-sm text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setPending((p) => Math.min(100, p + 1))}
                disabled={busy}
                aria-label="One ticket more"
                className="h-7 w-7 cursor-pointer rounded-none border border-border text-sm text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:opacity-40"
              >
                +
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (pending > 0 && (await onGrant(pending))) setPending(0)
                }}
                disabled={busy || pending === 0}
                className="h-7 cursor-pointer rounded-none bg-accent px-3 text-[10px] uppercase tracking-wider text-warm transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                {busy ? '…' : 'Give'}
              </button>
            </div>
          )}

          {/* Unlimited: sliding pill + one-line inline confirm. */}
          {confirmUnlimited == null ? (
            <div className="flex items-center gap-2">
              <span className="mr-auto text-[10px] uppercase tracking-wider">Unlimited</span>
              <button
                type="button"
                role="switch"
                aria-checked={status.unlimited}
                aria-label="Unlimited tickets"
                disabled={busy}
                onClick={() => setConfirmUnlimited(!status.unlimited)}
                className={`relative h-5 w-9 cursor-pointer rounded-full border transition-colors disabled:opacity-40 ${
                  status.unlimited ? 'border-accent/60 bg-accent/30' : 'border-border bg-bg-page'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute top-[3px] h-3 w-3 rounded-full transition-all ${
                    status.unlimited ? 'left-[19px] bg-accent' : 'left-[3px] bg-text-muted'
                  }`}
                />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] normal-case text-text">
                {confirmUnlimited
                  ? `Make ${firstName} unlimited?`
                  : `Return ${firstName} to counted tickets?`}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (await onSetUnlimited(confirmUnlimited)) setConfirmUnlimited(null)
                }}
                className="cursor-pointer text-[10px] uppercase tracking-wider text-accent transition-colors hover:text-accent-hover disabled:opacity-40"
              >
                {busy ? '…' : 'Confirm'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmUnlimited(null)}
                className="cursor-pointer text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-text disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="mt-2 text-[11px] normal-case text-error">{error}</p>}
    </div>
  )
}
