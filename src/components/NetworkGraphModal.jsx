import { useEffect, useMemo, useRef } from 'react'
import { buildConstellationLayout } from '../lib/constellationLayout'
import { buildJourneyLine } from '../lib/journeyLine'
import ConstellationMap from './ConstellationMap'

/**
 * "See network graph" (creator dashboard, 2026-09-03) — the VIEWER
 * constellation for one film, exactly as viewers see it: the same layout
 * (src/lib/constellationLayout.js) and renderer (ConstellationMap), the
 * same who-exists rule (voided links nowhere, ghosts only per the film's
 * show_ghosts flag), the same names rule (displayName.js), the same
 * collision-based labels. The differences are the explicit NO-VIEWER
 * mode — the filmmaker is the center, there is no YOU and no fixed gold
 * path — and the map's explore behaviour: hover (desktop) or tap (touch)
 * on any person lights THAT person's lineage gold — film → them → their
 * entire downstream — nothing lit at rest. Solid dot = claimed, hollow =
 * in flight (the emblem's grammar).
 *
 * Native <dialog>, same behaviour contract as the watch page's pass-it-on
 * modal: Esc via the cancel event, close on × and on a MOUSEDOWN on the
 * scrim itself, body scroll locked while open, mounted only while open.
 * Copy: only founder-approved lines already in use elsewhere — the V5
 * section heading, the journey line, and the V5 empty state.
 */
export default function NetworkGraphModal({ film, invites, creatorId, creatorName, onClose }) {
  const dialogRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.showModal()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  const layout = useMemo(
    () =>
      buildConstellationLayout({
        filmInvites: invites || [],
        creatorId,
        creatorName,
        includeGhosts: film?.show_ghosts === true,
        noViewer: true,
      }),
    [invites, creatorId, creatorName, film?.show_ghosts]
  )

  // The journey line's X comes from the constellation's tree (ONE counting
  // path); with no viewer there is no Y.
  const journey = useMemo(
    () => buildJourneyLine({ reached: layout?.inviteCount ?? 0, downstream: 0 }),
    [layout]
  )

  const handleScrimMouseDown = (e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
  }

  const titleId = `network-graph-title-${film?.id ?? 'film'}`

  return (
    <dialog
      ref={dialogRef}
      id="network-graph-modal"
      aria-labelledby={titleId}
      onMouseDown={handleScrimMouseDown}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="dc-passiton-scrim dc-fade-in fixed inset-0 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center overflow-y-auto bg-tint-scrim px-0 py-2 min-[540px]:p-4"
    >
      <div
        ref={panelRef}
        className="dc-result-rise relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto border-y border-warm/15 bg-ink px-4 pb-8 pt-9 text-warm min-[540px]:max-w-[64rem] min-[540px]:border min-[540px]:px-8 min-[540px]:pb-9 min-[540px]:pt-10"
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-1.5 top-1.5 flex h-11 w-11 cursor-pointer touch-manipulation items-center justify-center text-warm/60 transition-colors hover:text-warm focus-visible:text-warm focus-visible:outline-none"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            aria-hidden
            className="h-4 w-4"
          >
            <line x1="2" y1="2" x2="14" y2="14" />
            <line x1="14" y1="2" x2="2" y2="14" />
          </svg>
        </button>

        {/* The V5 section heading, verbatim — this IS that section, for
            the filmmaker. */}
        <p
          id={titleId}
          className="font-sans font-normal text-[11px] uppercase tracking-[0.32em] text-muted"
        >
          Where this film has traveled
        </p>
        <p className="mt-2 font-serif-v3 italic text-[1.375rem] leading-tight text-warm">
          {film?.title}
        </p>

        {layout ? (
          <>
            <p className="mt-4 font-serif-v3 text-[1.0625rem] italic leading-normal text-warm/85">
              {journey.segments.map((seg, i) =>
                seg.bold ? (
                  <b key={i} className="font-medium text-accent">
                    {seg.text}
                  </b>
                ) : (
                  <span key={i}>{seg.text}</span>
                )
              )}
            </p>
            <ConstellationMap key={`${layout.width}x${layout.height}`} layout={layout} explore />
          </>
        ) : (
          <p className="mt-6 font-serif-v3 italic text-warm/60">No tickets shared yet.</p>
        )}
      </div>
    </dialog>
  )
}
