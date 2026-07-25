import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useLocation, Link, Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import DeepcastLogo from '../components/DeepcastLogo'
import { filmConditionsLine } from '../lib/screeningConditions'
import { readClaimStash, isClaimOwner } from '../lib/claimStash'
import { INITIAL_CLAIMANT_TICKETS } from '../lib/ticketRules'
import { firstNameInputError } from '../lib/firstNameRule'
import { revealTicketsLine } from '../lib/revealTicketsLine'
import { resumePositionToSave } from '../lib/resumePosition'
import { safeLocalStorage } from '../lib/safeStorage'
import { fullscreenPlayDecision, isIOSDevice } from '../lib/playbackFullscreen'
import {
  nextTier,
  crossedTiers,
  tierFillPercent,
  formatTierNumber,
} from '../lib/viewerTiers'
import {
  chainHands,
  pairsOfHandsPhrase,
  lastHands,
  lineageLabel,
  chainForkFlags,
} from '../lib/handsChain'
import { filmStory, filmPosterUrl } from '../content/filmStory'

/** Claim-flow resume keys (slug-scoped — the claimant's public token is never
 *  exposed client-side). Seconds feed the resume; the fraction feeds the
 *  dashboard card's thin progress bar. Same completion-zone rule as the
 *  legacy flow: inside the final 5% the position is ERASED, never saved. */
const positionKey = (slug) => `screening_position_slug_${slug}`
const progressKey = (slug) => `screening_progress_slug_${slug}`

const MuxPlayer = lazy(() => import('@mux/mux-player-react').then((m) => ({ default: m.default })))

/**
 * Decorative ticket stubs (reference motif, adopted 2026-07-19): one outlined
 * stub per granted ticket, spent ones dimmed newest-first — the same live
 * wallet values the text line shows, no extra fetching. `remaining` is the
 * RAW server balance: a non-finite value (unlimited sharer, or a legacy
 * uninitialized wallet) renders NO stubs — stubs imply a finite count; the
 * text line keeps its existing presentation either way. The used count is
 * clamped into [0, granted] so historical wallets can never overflow or go
 * negative. Purely decorative (aria-hidden); the text line is the accessible
 * count. Dimming transitions 400ms; reduced-motion dims instantly.
 */
function TicketStubs({ granted, remaining }) {
  if (!Number.isFinite(remaining)) return null
  const used = Math.min(Math.max(granted - remaining, 0), granted)
  return (
    <div aria-hidden className="mt-8 flex items-center justify-center gap-3 min-[540px]:gap-3.5">
      {Array.from({ length: granted }, (_, i) => {
        const isUsed = i >= granted - used
        return (
          <svg
            key={i}
            viewBox="0 0 32 20"
            data-stub={isUsed ? 'used' : 'unused'}
            className={`h-5 w-8 text-accent transition-opacity duration-[400ms] ease-out motion-reduce:transition-none ${
              isUsed ? 'opacity-[0.22]' : 'opacity-100'
            }`}
          >
            <path
              d="M2 2 h28 v5 a3 3 0 0 0 0 6 v5 h-28 v-5 a3 3 0 0 0 0-6 z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        )
      })}
    </div>
  )
}

/**
 * The lineage emblem (redesign spec §5) — the film's recent hands, drawn as
 * a small branch inside the modal. The geometry is a FIXED, hand-composed
 * template (identical for every viewer of every film); ONLY the name labels
 * and element visibility are dynamic — string substitution, no layout
 * engine. Node grammar (sacred): solid = claimed/arrived · hollow = a
 * ticket not yet claimed; the "?" sits in the NAME SLOT above the hollow
 * node, never inside the circle. aria-hidden — the rail's rule line carries
 * the accessible fact.
 *
 * NEAR-BRANCH FORKS (owner-approved 2026-07-23): each faint fork renders
 * ONLY when the server confirmed that hand made at least one other share
 * (`lineageForks` → chainForkFlags — never an invented person). The fork
 * geometry is the replica's, mapped per slot; the pre-frame entry forks
 * render only when a hand DEEPER than the three shown verifiably forked.
 * Far-field dots are pure atmosphere and stay. Predecessors shown = the
 * last min(3, chain length) hands, occupying the template slots CLOSEST to
 * YOU; the faint entry stroke renders only when the chain runs deeper than
 * the three shown.
 */
function LineageEmblem({ hands, forks = [], nextLabel }) {
  const shown = lastHands(hands, 3)
  if (shown.length === 0) return null

  // Template slots (replica geometry, fixed): position, node size/opacity,
  // and each slot's label anchor.
  const SLOTS = [
    { x: 70, y: 92, r: 2.2, op: 0.7, lx: 62, ly: 110 },
    { x: 140, y: 60, r: 2.4, op: 0.78, lx: 140, ly: 47 },
    { x: 215, y: 84, r: 2.6, op: 0.85, lx: 215, ly: 71 },
  ]
  // Replica fork clusters, per slot (lines / junction dots / twig-end dots).
  const SLOT_FORKS = [
    {
      lines: [
        [70, 92, 104, 132],
        [104, 132, 152, 146],
        [104, 132, 146, 118],
        [70, 92, 92, 46],
        [92, 46, 126, 22],
        [92, 46, 130, 54],
      ],
      junctions: [
        [104, 132],
        [92, 46],
      ],
      twigs: [
        [152, 146],
        [146, 118],
        [126, 22],
        [130, 54],
      ],
    },
    {
      lines: [
        [140, 60, 190, 40],
        [190, 40, 226, 18],
        [190, 40, 228, 46],
      ],
      junctions: [[190, 40]],
      twigs: [
        [226, 18],
        [228, 46],
      ],
    },
    {
      lines: [
        [215, 84, 248, 126],
        [248, 126, 298, 140],
        [248, 126, 228, 148],
      ],
      junctions: [[248, 126]],
      twigs: [
        [298, 140],
        [228, 148],
      ],
    },
  ]
  // The replica's pre-frame entry forks — hands beyond the frame.
  const PRE_FRAME_FORKS = {
    lines: [
      [22, 105, 50, 140],
      [37, 101, 62, 64],
    ],
    junctions: [],
    twigs: [
      [50, 140],
      [62, 64],
    ],
  }
  const YOU = { x: 288, y: 52 }
  const NEXT = { x: 350, y: 80 }
  const active = SLOTS.slice(3 - shown.length)
  const activeForks = SLOT_FORKS.slice(3 - shown.length)
  const shownForks = forks.slice(-shown.length)
  // The gold path brightens toward its newest tip; segment opacities are
  // template-fixed, taken from the YOU end backward.
  const points = [...active.map((s) => ({ x: s.x, y: s.y })), YOU]
  const segmentOpacities = [0.45, 0.55, 0.65].slice(-(points.length - 1))
  const entryStroke = hands.length > 3
  // Pre-frame forks: only if some hand DEEPER than the shown three forked.
  const preFrameFork = entryStroke && forks.slice(0, forks.length - shown.length).some(Boolean)

  /* INTERIM (owner direction 2026-07-23, pending the sparse design-ref):
     chains shorter than 3 leave the fixed composition hugging the right
     edge, so the RENDERED constellation group is horizontally centered by
     a pure translate — no new composition, no new elements, and the
     far-field dots stay put (full-canvas atmosphere). Full chains (3 shown)
     keep the replica's exact placement. */
  const xMin = active[0].x
  const xMax = nextLabel ? NEXT.x : YOU.x
  const dx = shown.length < 3 ? Math.round((200 - (xMin + xMax) / 2) * 10) / 10 : 0

  const forkCluster = (cluster, key) => (
    <g key={key} data-fork={key}>
      <g stroke="rgba(221,221,221,0.1)" strokeWidth="0.8">
        {cluster.lines.map(([x1, y1, x2, y2]) => (
          <line key={`${x1},${y1},${x2},${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      <g fill="rgba(221,221,221,0.22)">
        {cluster.junctions.map(([cx, cy]) => (
          <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="1.6" />
        ))}
      </g>
      <g fill="rgba(221,221,221,0.18)">
        {cluster.twigs.map(([cx, cy]) => (
          <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="1.3" />
        ))}
      </g>
    </g>
  )

  const labelStyle = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 400,
    letterSpacing: '0.15em',
  }

  return (
    <figure aria-hidden="true" className="mx-auto mt-7 w-full max-w-[25rem]">
      <svg viewBox="0 0 400 160" xmlns="http://www.w3.org/2000/svg" className="block h-auto w-full">
        {/* Far field: distant parts of the tree — pure atmosphere, ALWAYS
            rendered, never wired to data. */}
        <g fill="rgba(221,221,221,0.13)">
          <circle cx="44" cy="26" r="1.2" />
          <circle cx="204" cy="14" r="1.2" />
          <circle cx="368" cy="34" r="1.2" />
          <circle cx="346" cy="142" r="1.2" />
          <circle cx="16" cy="40" r="1.2" />
        </g>
        {/* Everything below rides the INTERIM centering translate (dx=0 for
            full chains) — the constellation group, its forks, and labels
            move as one; the far field above stays put. */}
        <g transform={dx !== 0 ? `translate(${dx} 0)` : undefined}>
        {/* Near branches — each faint fork is a REAL share by that hand
            (server-confirmed booleans; nothing invented). */}
        {activeForks.map((cluster, i) =>
          shownForks[i] ? forkCluster(cluster, `slot-${3 - shown.length + i}`) : null
        )}
        {preFrameFork && forkCluster(PRE_FRAME_FORKS, 'preframe')}
        {/* The gold path: entry stroke implies the deeper chain. */}
        <g strokeWidth="1" fill="none">
          {entryStroke && (
            <line x1="4" y1="110" x2="70" y2="92" stroke="rgba(177,161,128,0.3)" />
          )}
          {points.slice(0, -1).map((p, i) => (
            <line
              key={`${p.x},${p.y}`}
              x1={p.x}
              y1={p.y}
              x2={points[i + 1].x}
              y2={points[i + 1].y}
              stroke={`rgba(177,161,128,${segmentOpacities[i]})`}
            />
          ))}
          {/* To the unclaimed next: dashed — not yet walked. */}
          {nextLabel && (
            <line
              x1={YOU.x}
              y1={YOU.y}
              x2={NEXT.x}
              y2={NEXT.y}
              strokeDasharray="3 3"
              stroke="rgba(177,161,128,0.5)"
            />
          )}
        </g>
        {/* Hands: solid = claimed; growing toward the present. */}
        <g fill="#b1a180">
          {active.map((s) => (
            <circle key={`${s.x},${s.y}`} cx={s.x} cy={s.y} r={s.r} opacity={s.op} />
          ))}
          <circle cx={YOU.x} cy={YOU.y} r="3.6" />
          <circle
            cx={YOU.x}
            cy={YOU.y}
            r="7"
            fill="none"
            stroke="rgba(177,161,128,0.35)"
            strokeWidth="0.8"
          />
        </g>
        {/* The unclaimed next: hollow — it stays hollow until claimed. */}
        {nextLabel && (
          <circle
            cx={NEXT.x}
            cy={NEXT.y}
            r="3.2"
            fill="none"
            stroke="rgba(177,161,128,0.8)"
            strokeWidth="1.2"
          />
        )}
        {/* Names — REAL first names from the viewer's chain, uppercased,
            ~8-char cap (lineageLabel). */}
        {active.map((s, i) => (
          <text
            key={`label-${s.x}`}
            x={s.lx}
            y={s.ly}
            fontSize="9"
            textAnchor="middle"
            fill="rgba(221,221,221,0.75)"
            style={labelStyle}
          >
            {lineageLabel(shown[i])}
          </text>
        ))}
        <text
          x={YOU.x}
          y="38"
          fontSize="9"
          textAnchor="middle"
          fill="var(--color-accent)"
          style={labelStyle}
        >
          YOU
        </text>
        {nextLabel && (
          <text
            x={NEXT.x}
            y="67"
            fontSize="9"
            textAnchor="middle"
            fill="rgba(177,161,128,0.85)"
            style={labelStyle}
          >
            {nextLabel}
          </text>
        )}
        </g>
      </svg>
    </figure>
  )
}

/**
 * The pass-it-on modal (redesign spec §4) — the ticket window, opened by the
 * rail's CTA. Native <dialog> (top layer, Esc via the cancel event, focus
 * containment that automatically covers elements the reveal adds later).
 * Behavior contract: open → focus the first-name field; close on ×, Esc, and
 * MOUSEDOWN on the scrim itself (mousedown, not click — a text-selection
 * drag ending outside must not dismiss); focus returns to the CTA (the
 * caller's onClose owns that); body scroll locks while open. Mounted only
 * while open, so the entrance animations (.dc-fade-in scrim,
 * .dc-result-rise panel) restart on every open; reduced-motion overrides
 * live on those classes in index.css.
 */
function PassItOnModal({
  onClose,
  granted,
  remaining,
  tickets,
  outOfTickets,
  shareName,
  onNameChange,
  shareBusy,
  shareError,
  onSubmit,
  hands,
  handForks,
  generated,
  copied,
  onCopy,
  onAgain,
}) {
  const dialogRef = useRef(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    dialogRef.current?.showModal()
    inputRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  /** The modal cycles: when "Create another invitation" swaps the form back
   *  in, the (re-rendered) field takes focus again. Native <dialog> focus
   *  containment re-covers whatever the reveal adds or removes. */
  useEffect(() => {
    if (!generated) inputRef.current?.focus()
  }, [generated])

  /** Scrim dismissal: only a mousedown that starts OUTSIDE the panel closes
   *  (clicks on the dialog element itself — never its children). */
  const handleScrimMouseDown = (e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      id="passiton-modal"
      aria-labelledby="passiton-title"
      onMouseDown={handleScrimMouseDown}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="dc-passiton-scrim dc-fade-in fixed inset-0 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center overflow-y-auto bg-tint-scrim px-0 py-2 min-[540px]:p-4"
    >
      <div
        ref={panelRef}
        className="dc-result-rise relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto border-y border-warm/15 bg-ink px-6 pb-11 pt-10 text-center text-warm min-[540px]:max-w-[30rem] min-[540px]:border min-[540px]:px-10 min-[540px]:pb-12 min-[540px]:pt-11"
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

        {/* The eyebrow doubles as the modal's accessible name (the dialog's
            aria-labelledby points here). "Make an impact." cut 2026-07-25. */}
        <p
          id="passiton-title"
          className="font-sans font-normal text-[11px] uppercase tracking-[0.32em] text-muted"
        >
          Pass it on
        </p>

        {/* The lineage — how it reached you, and the unclaimed next. State 2
            makes exactly one substitution: the "?" becomes the recipient's
            name; the node STAYS hollow until they claim. */}
        <LineageEmblem
          hands={hands}
          forks={handForks}
          nextLabel={generated ? lineageLabel(generated.name) : outOfTickets ? null : '?'}
        />

        {/* Stubs sit above the tickets/zero line — in the zero state they
            remain, all dimmed (the emptied ticket book reads better than a
            bare sentence). */}
        <TicketStubs granted={granted} remaining={remaining} />

        {generated ? (
          /* ── State 2 — THE REPLACEMENT MODEL (spec §4b): the reveal
             REPLACES the charge and the form (and the standalone count
             line — the reveal's own line is authoritative), so the link
             renders where the field was: zero scrolling to see it. ── */
          <div
            key={generated.url}
            className="dc-result-rise mx-auto mt-8 max-w-[30rem] border-t border-warm/15 pt-7"
          >
            {/* Founder-approved reveal copy (amendment A, 2026-07-23). */}
            <p className="mx-auto font-serif-v3 italic text-[1.0625rem] leading-[1.7] text-warm/85">
              Here’s {generated.name}’s ticket link. Send it to them with why they came
              to mind.
            </p>
            {/* The bare link — no pre-written message, ever (product law). */}
            <p className="mt-3 break-all font-serif-v3 text-[clamp(1.1875rem,3vw,1.4375rem)] text-paper/90">
              {generated.url}
            </p>
            <button
              type="button"
              onClick={onCopy}
              className="mt-6 min-h-[44px] cursor-pointer touch-manipulation border border-warm/20 px-9 py-3 font-sans font-normal text-xs uppercase tracking-[0.26em] text-warm transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
            >
              {copied ? 'Copied' : 'Copy their invitation'}
            </button>
            <p className="mt-7 font-sans font-normal text-xs uppercase tracking-[0.24em] text-muted">
              {revealTicketsLine(generated.ticketsRemaining)}
            </p>
            {/* The share-again act — a true gold-outline button (a box acts;
                an arrow navigates). Omitted after the last ticket: there is
                nothing left to create. */}
            {(generated.ticketsRemaining == null || generated.ticketsRemaining > 0) && (
              <p className="mt-3.5">
                <button
                  type="button"
                  onClick={onAgain}
                  className="inline-block min-h-[44px] cursor-pointer touch-manipulation border border-accent/60 px-7 py-[0.6875rem] font-sans font-normal text-[0.6875rem] uppercase tracking-[0.26em] text-accent transition-colors duration-300 hover:border-accent hover:bg-accent hover:text-ink focus-visible:border-accent focus-visible:bg-accent focus-visible:text-ink focus-visible:outline-none"
                >
                  Create another invitation
                </button>
              </p>
            )}
            <p className="mt-8">
              <Link
                to="/dashboard"
                className="font-sans font-normal text-xs uppercase tracking-[0.24em] text-muted transition-colors hover:text-warm"
              >
                See where your ticket went →
              </Link>
            </p>
          </div>
        ) : outOfTickets ? (
          <p
            className={`${Number.isFinite(remaining) ? 'mt-3.5' : 'mt-8'} font-sans font-normal text-xs uppercase tracking-[0.24em] text-muted`}
          >
            You’ve shared all your tickets for this film.
          </p>
        ) : (
          <>
            {/* The count — founder-directed whittle ("{n} tickets left."). */}
            <p
              className={`${Number.isFinite(remaining) ? 'mt-3.5' : 'mt-8'} font-sans font-normal text-xs uppercase tracking-[0.24em] text-muted`}
            >
              {tickets ?? '…'} ticket{tickets === 1 ? '' : 's'} left.
            </p>

            {/* The charge — founder-approved verbatim (2026-07-23, final).
                NBSP binds "anyone" to the dash so "—" never leads a line. */}
            {/* Founder amendment 2026-07-23: 1.125rem, up from 1.0625rem. */}
            <p className="mx-auto mt-6 max-w-[26rem] font-serif-v3 italic text-[1.125rem] leading-[1.7] text-warm/80">
              Who <span className="text-accent">needs</span> to see this? Not
              anyone{' '}— the one it will matter{' '}to.
            </p>

            <form onSubmit={onSubmit} className="mx-auto mt-7 flex max-w-[22rem] flex-col gap-4">
              <label htmlFor="share-first-name" className="sr-only">
                Their first name
              </label>
              <input
                ref={inputRef}
                id="share-first-name"
                type="text"
                value={shareName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Their first name"
                maxLength={50}
                className="w-full border-b border-warm/20 bg-transparent px-1 py-3 text-center font-sans text-base font-light tracking-[0.06em] text-warm transition-colors duration-300 placeholder:font-serif-v3 placeholder:italic placeholder:tracking-normal placeholder:text-warm/40 focus:border-accent focus:outline-none"
              />
              {shareError && <p className="font-sans text-xs text-error/90">{shareError}</p>}
              <button
                type="submit"
                disabled={shareBusy}
                className="min-h-[48px] w-full cursor-pointer touch-manipulation border border-accent/60 px-6 py-3.5 font-sans font-normal text-[0.8125rem] uppercase tracking-[0.28em] text-accent transition-colors duration-300 hover:border-accent hover:bg-accent hover:text-ink focus-visible:border-accent focus-visible:bg-accent focus-visible:text-ink focus-visible:outline-none disabled:opacity-50"
              >
                {shareBusy ? 'One moment…' : 'Create their invitation'}
              </button>
            </form>
          </>
        )}
      </div>
    </dialog>
  )
}

/**
 * PAGE 2 of the three-page structure: the watch page, in its founder-approved
 * two-column redesign (ground truth design-refs/watch-page_24.html; behavior
 * spec design-refs/watch-page-spec.md). Desktop ≥900px: header → masthead →
 * hero grid (player left, the record/act/law rail right) → creed band →
 * filmmaker story → footer. Below 900px the same modules stack in natural
 * order. The pass-it-on flow moves into a modal opened by the rail CTA
 * (founder override of the old always-docked panel).
 *
 * Only the claimant (recognized by the safeStorage stash or a signed-in
 * session matching claimed_by) lands here; anyone else is bounced to the
 * landing route, which shows the dead-link page for claimed slugs.
 */
export default function ClaimWatch() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  /* Arrival-from-prologue fade (owner spec 2026-07-21) — COSMETIC only.
     The in-memory router marker makes this one arrival breathe in over 1s;
     every other entry (direct visit, revisit, refresh) renders instantly.
     Captured once at mount, then scrubbed from the history entry so a
     refresh or back-swipe never replays it. Reduced-motion skips the fade.
     NO storage; the prologue's once-per-claim logic never reads this. */
  const [arrivalFade] = useState(
    () =>
      Boolean(location.state?.fromPrologue) &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    if (window.history.state?.usr?.fromPrologue) {
      window.history.replaceState({ ...window.history.state, usr: null }, '')
    }
  }, [])
  const stash = readClaimStash()
  const stashOwner = isClaimOwner(stash, slug)
  /** Session-based ownership (Piece E return visits): on a new browser there
   *  is no stash, but a signed-in silent-account holder whose claimed_by
   *  matches this slug's invite is the same person. undefined = resolving. */
  const [sessionOwner, setSessionOwner] = useState(stashOwner ? false : undefined)
  useEffect(() => {
    if (stashOwner) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } = {} } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) {
          if (!cancelled) setSessionOwner(false)
          return
        }
        const { data: inv } = await supabase
          .from('invites')
          .select('id, claimed_by')
          .eq('link_slug', String(slug || '').trim().toLowerCase())
          .maybeSingle()
        if (!cancelled) {
          setSessionOwner(Boolean(inv?.claimed_by && String(inv.claimed_by) === String(uid)))
        }
      } catch {
        if (!cancelled) setSessionOwner(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, stashOwner])
  const owner = stashOwner || sessionOwner === true

  /** Start position, resolved once at mount: "Watch again" (?again=1) starts
   *  clean and clears the saved spot; otherwise resume where they left off. */
  const [startSeconds] = useState(() => {
    if (searchParams.get('again')) {
      safeLocalStorage.removeItem(positionKey(slug))
      safeLocalStorage.removeItem(progressKey(slug))
      return 0
    }
    const saved = Number(safeLocalStorage.getItem(positionKey(slug)))
    return Number.isFinite(saved) && saved > 0 ? saved : 0
  })
  const lastSavedSecond = useRef(-1)

  const [link, setLink] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [tickets, setTickets] = useState(null)
  /** The RAW server balance, kept apart from the healed `tickets` display:
   *  the stubs render only for a finite server number. NULL means unlimited
   *  (no finite count exists — text-only presentation stays) or a legacy
   *  uninitialized wallet (unknown until its first spend) — no stubs either
   *  way, and the text line keeps its existing healed behavior untouched. */
  const [stubBalance, setStubBalance] = useState(null)
  const [shareName, setShareName] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState('')
  const [generated, setGenerated] = useState(null)
  const [copied, setCopied] = useState(false)
  const hasMarkedWatched = useRef(false)
  /** The pass-it-on modal (redesign §4). Mounted only while open so its
   *  entrance animations restart each time; focus returns to the CTA on
   *  every close path. */
  const [shareOpen, setShareOpen] = useState(false)
  const ctaRef = useRef(null)
  const closeShare = () => {
    setShareOpen(false)
    setTimeout(() => ctaRef.current?.focus(), 0)
  }

  /* ── Phone fullscreen-landscape playback (2026-07-19; decisions in
     src/lib/playbackFullscreen.js). Desktop/tablet: nothing here ever runs —
     the decision returns 'none' for fine pointers and ≥540px viewports. ── */
  const playerRef = useRef(null)
  /** First user-initiated play per page load only — once attempted, a viewer
   *  who exits fullscreen and keeps watching inline is never re-forced. */
  const fsAttempted = useRef(false)
  const [rotateHint, setRotateHint] = useState(false)

  /** The hint retires itself: after a few seconds, or as soon as the phone
   *  is actually rotated (legacy gotcha: some browsers fire only resize,
   *  others only orientationchange — listen to both). */
  useEffect(() => {
    if (!rotateHint) return
    const hideIfLandscape = () => {
      if (window.matchMedia('(orientation: landscape)').matches) setRotateHint(false)
    }
    const timer = setTimeout(() => setRotateHint(false), 4000)
    window.addEventListener('orientationchange', hideIfLandscape)
    window.addEventListener('resize', hideIfLandscape)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('orientationchange', hideIfLandscape)
      window.removeEventListener('resize', hideIfLandscape)
    }
  }, [rotateHint])

  /** Whenever fullscreen exits — our own exit at credits, the browser's back
   *  gesture, or Esc — release the orientation lock so the page isn't stuck
   *  sideways (the lock can outlive fullscreen on some Androids). */
  useEffect(() => {
    const onFullscreenChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement
      if (!fsEl) {
        try {
          screen.orientation?.unlock?.()
        } catch {
          /* lock/unlock unsupported — nothing held */
        }
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
  }, [])

  /** ADDITIVE handler (rule: existing handlers unchanged — this prop did not
   *  exist before this piece). Phones only, first play only. */
  const handlePlay = () => {
    const decision = fullscreenPlayDecision({
      alreadyAttempted: fsAttempted.current,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      viewportMinPx: Math.min(window.innerWidth, window.innerHeight),
      iOS: isIOSDevice(navigator),
      portrait: window.matchMedia('(orientation: portrait)').matches,
    })
    if (decision.action === 'none') return
    fsAttempted.current = true
    const mp = playerRef.current
    if (decision.action === 'ios-native') {
      // iOS: only the NATIVE video fullscreen exists (no document fullscreen
      // for this, no orientation lock) — it rotates with the device, hence
      // the hint when the phone is still portrait. Feature-detected: the API
      // exists only on iOS WebKit.
      if (decision.rotateHint) setRotateHint(true)
      const video = mp?.media?.nativeEl
      if (typeof video?.webkitEnterFullscreen === 'function') {
        try {
          video.webkitEnterFullscreen()
        } catch {
          /* refused — playback continues inline */
        }
      }
      return
    }
    // Android & other non-iOS phones: element fullscreen, then a best-effort
    // landscape lock — some browsers refuse the lock; degrade to plain
    // fullscreen (and to inline if even fullscreen is refused).
    Promise.resolve()
      .then(() => mp?.requestFullscreen?.({ navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {
        /* lock or fullscreen refused — degrade silently */
      })
  }

  /** ADDITIVE handler (this prop did not exist before this piece): at the
   *  credits, leave every kind of fullscreen so the viewer lands back on the
   *  page — the pass-it-on ask is the destination. */
  const handleEnded = () => {
    try {
      screen.orientation?.unlock?.()
    } catch {
      /* unsupported */
    }
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen
      try {
        const p = exit?.call(document)
        p?.catch?.(() => {})
      } catch {
        /* already out */
      }
    }
    const video = playerRef.current?.media?.nativeEl
    if (typeof video?.webkitExitFullscreen === 'function') {
      try {
        video.webkitExitFullscreen()
      } catch {
        /* already out */
      }
    }
  }

  useEffect(() => {
    if (!owner) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.getLinkInvite(slug)
        if (cancelled) return
        setLink(data)
        // Server value wins; NULL (claimed pre-migration) reads as the full
        // grant — the server heals it on first spend.
        setTickets(data.ticketsRemaining ?? INITIAL_CLAIMANT_TICKETS)
        setStubBalance(Number.isFinite(data.ticketsRemaining) ? data.ticketsRemaining : null)
      } catch {
        if (!cancelled) setLoadFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, owner])

  if (!stashOwner && sessionOwner === undefined) {
    // Ownership still resolving (session lookup) — never flash the dead-link
    // page at the rightful owner.
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg-page">
        <div
          className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
      </div>
    )
  }
  if (!owner) return <Navigate to={`/${slug}`} replace />

  /** ≥70% playback marks the invite watched (same threshold and update
   *  pattern as the legacy screening page), and every whole second the
   *  resume position is saved through resumePositionToSave — the ONE
   *  completion-zone rule (src/lib/resumePosition.js), so a near-end
   *  position is erased, never stored. */
  const handleTimeUpdate = async (e) => {
    const el = e?.target
    if (!el) return
    const t = el.currentTime || 0
    const d = el.duration || 0

    const second = Math.floor(t)
    if (d > 0 && second !== lastSavedSecond.current) {
      lastSavedSecond.current = second
      const pos = resumePositionToSave(t, d)
      if (pos == null) {
        safeLocalStorage.removeItem(positionKey(slug))
        safeLocalStorage.removeItem(progressKey(slug))
      } else {
        safeLocalStorage.setItem(positionKey(slug), String(pos))
        safeLocalStorage.setItem(progressKey(slug), String(Math.min(t / d, 1)))
      }
    }

    // The invite id comes from the stash, or from the link payload for a
    // signed-in session owner on a new browser (Piece E return visits).
    const ownInviteId = stash?.inviteId || link?.inviteId
    if (hasMarkedWatched.current || !ownInviteId) return
    const pct = d > 0 ? (t / d) * 100 : 0
    if (pct >= 70) {
      hasMarkedWatched.current = true
      await supabase.from('invites').update({ status: 'watched' }).eq('id', ownInviteId)
    }
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    const name = shareName.trim()
    const nameError = firstNameInputError(name)
    if (nameError) {
      setShareError(nameError)
      return
    }
    setShareBusy(true)
    setShareError('')
    try {
      // Piece E: when a session exists (silent account, signed in), send it —
      // the server then verifies identity from the token; the claimed invite
      // id still rides along as the lineage parent AND as the identity
      // fallback, so a stash-only claimant behaves exactly as before either
      // way (the wallet is the same account balance on both paths). On a new
      // browser (no stash) the link payload supplies the invite id.
      const ownInviteId = stash?.inviteId || link?.inviteId || null
      const { data: { session } = {} } = await supabase.auth.getSession()
      const result = await api.createInviteLink(name, {
        claimedInviteId: ownInviteId,
        filmId: stash?.filmId || null,
        parentInviteId: ownInviteId,
        accessToken: stash?.filmId ? session?.access_token || null : null,
        appUrl: window.location.origin,
      })
      // The reveal keeps its OWN copy of the response balance: null means an
      // unlimited sharer (never a count) — distinct from the healed tickets
      // display state above.
      setGenerated({ url: result.url, name, ticketsRemaining: result.ticketsRemaining ?? null })
      if (result.ticketsRemaining != null) setTickets(result.ticketsRemaining)
      // Same moment the text count decrements, the newest-used stub dims.
      if (Number.isFinite(result.ticketsRemaining)) setStubBalance(result.ticketsRemaining)
      setShareName('')
      setCopied(false)
    } catch (err) {
      setShareError(err.message || 'Could not create the link — please try again.')
    } finally {
      setShareBusy(false)
    }
  }

  /** "Create another invitation" — the modal cycles back to State 1: the
   *  reveal clears, the charge and the (empty) field return. */
  const handleShareAgain = () => {
    setGenerated(null)
    setCopied(false)
    setShareError('')
  }

  const handleCopy = async () => {
    if (!generated?.url) return
    try {
      await navigator.clipboard.writeText(generated.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const title = link?.filmTitle || 'a film'
  const outOfTickets = tickets != null && tickets <= 0

  /* ── The rail's record (spec §3b): the film-wide TICKETS-SHARED count
     from the link payload (founder metric switch 2026-07-25 — non-void
     generated links, server-computed by the shared countFilmShares rule:
     voided never count, ghosts per show_ghosts). The HONEST number, no
     padding, no clamping (founder amendment E); a missing field reads as
     the empty record, so the milestones block simply stays absent. ── */
  const sharesCount = Number.isFinite(link?.filmSharesCount) ? link.filmSharesCount : 0
  const goal = nextTier(sharesCount)
  const crossed = crossedTiers(sharesCount)

  /* ── The rule line's chain depth (spec §3b.6) — from the same lineage the
     landing thread reads, id-verified collapse included. ── */
  const hands = chainHands(link?.lineageNames, { senderIsCreator: link?.senderIsCreator })
  const chainLength = hands.length
  /* Server-confirmed fork booleans, aligned with `hands` by the same
     collapse rule — the emblem lights a near-branch fork ONLY on true. */
  const handForks = chainForkFlags(link?.lineageForks, link?.lineageNames, {
    senderIsCreator: link?.senderIsCreator,
  })

  /* ── Per-film story + poster (founder amendments C/D) — one module,
     src/content/filmStory.js. No entry → no story section, nothing invented. ── */
  const story = filmStory(link?.muxPlaybackId)

  return (
    <div className={`relative min-h-dvh bg-bg-page text-warm${arrivalFade ? ' dc-watch-arrival' : ''}`}>
      {/* ══ Header — wordmark left, quiet dashboard link right; below 540px
          the wordmark centers and the link yields to the footer's. ══ */}
      <header className="relative z-10 flex items-center justify-center px-4 pt-[max(1.25rem,env(safe-area-inset-top,0px))] min-[540px]:justify-between min-[540px]:px-[clamp(1.5rem,4vw,3rem)]">
        <DeepcastLogo variant="wordmark" size="text-2xl" className="text-warm opacity-90" />
        <Link
          to="/dashboard"
          className="hidden font-sans font-normal text-xs uppercase tracking-[0.26em] text-muted transition-colors hover:text-warm min-[540px]:inline-block"
        >
          Your dashboard →
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[44rem] px-4 min-[540px]:px-[clamp(1rem,4vw,3rem)] min-[900px]:max-w-[80rem]">
        {/* ══ Masthead — film title + conditions line, nothing else. ══ */}
        <div className="pt-7 text-center min-[900px]:pt-[clamp(0.75rem,1.5svh,1.125rem)]">
          <h1 className="font-serif-v3 font-normal italic text-[clamp(1.5rem,2.2vw,1.75rem)] leading-[1.25]">
            {title}
          </h1>
          <p className="mt-2.5 inline-flex items-center justify-center gap-2 font-sans font-normal text-[10px] uppercase tracking-[0.26em] text-muted min-[900px]:mt-[0.4375rem]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden
              className="h-3.5 w-3.5 shrink-0"
            >
              <path d="M4 13a8 8 0 0 1 16 0" />
              <rect x="3" y="13" width="4" height="6" rx="1.5" />
              <rect x="17" y="13" width="4" height="6" rx="1.5" />
            </svg>
            {filmConditionsLine(link?.durationSeconds)}
          </p>

          {/* Portrait-play hint (iOS native fullscreen rotates with the
              device; approved three-word copy). Transient, self-dismisses —
              existing behavior, unchanged by the redesign. */}
          {rotateHint && (
            <p className="mt-3 font-sans font-normal text-[11px] uppercase tracking-[0.28em] text-accent dc-fade-in">
              Rotate your phone
            </p>
          )}
        </div>

        {/* ══ The hero grid — player left, the rail right; single column in
            natural order below 900px, where the player goes edge to edge. ══ */}
        <div className="mt-8 min-[900px]:mt-5 min-[900px]:grid min-[900px]:grid-cols-[minmax(0,1fr)_24rem] min-[900px]:items-stretch min-[900px]:gap-x-14">
          {/* ── Player — flat on ink, no shadow, never autoplay. ── */}
          <div className="min-w-0">
            <div className="w-screen ml-[calc(50%-50vw)] mr-[calc(50%-50vw)] bg-black dc-fade-in min-[900px]:ml-0 min-[900px]:mr-0 min-[900px]:w-full">
              {loadFailed ? (
                <p className="py-24 text-center font-serif-v3 text-sm italic text-warm/60">
                  Something went wrong loading the film — please refresh.
                </p>
              ) : (
                <Suspense
                  fallback={
                    <div className="flex aspect-video w-full items-center justify-center">
                      <div className="w-6 h-6 border-[0.5px] border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  <MuxPlayer
                    ref={playerRef}
                    streamType="on-demand"
                    playbackId={link?.muxPlaybackId || undefined}
                    poster={filmPosterUrl(link?.muxPlaybackId)}
                    startTime={startSeconds}
                    metadata={{ video_title: title }}
                    accentColor="#b1a180"
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={handlePlay}
                    onEnded={handleEnded}
                    className="aspect-video w-full"
                  />
                </Suspense>
              )}
            </div>
          </div>

          {/* ── The rail — the record, the act, the law. One left edge,
              vertically centered against the player on desktop (the left
              column holds ONLY the player — the centering contract). ── */}
          <div className="min-w-0">
            {/* Founder amendment 2026-07-23: optical lift — 2.5rem bottom
                padding inside the centered flex, so the cluster's mass sits
                a touch above geometric center (it read slightly low against
                the player, especially with the milestones block absent).
                Desktop only; mobile keeps natural block flow. */}
            <div className="mx-auto mt-9 w-full max-w-[26rem] text-left min-[900px]:mx-0 min-[900px]:mt-0 min-[900px]:flex min-[900px]:h-full min-[900px]:max-w-none min-[900px]:flex-col min-[900px]:justify-center min-[900px]:pb-10">
              {/* The record: bar → count → goal label. Squared ends, solid
                  accent fill, progress toward the NEXT tier only. */}
              <section
                aria-label={`${formatTierNumber(sharesCount)} tickets shared of ${formatTierNumber(goal)} goal`}
              >
                <div aria-hidden className="h-[2px] w-full bg-tint-track">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${tierFillPercent(sharesCount)}%` }}
                  />
                </div>
                <p
                  aria-hidden
                  className="mt-[1.125rem] font-sans font-semibold text-[2.25rem] leading-none tracking-[0.01em] text-warm"
                >
                  {formatTierNumber(sharesCount)}
                </p>
                <p
                  aria-hidden
                  className="mt-[0.625rem] font-sans font-normal text-[0.8125rem] uppercase leading-[1.6] tracking-[0.18em] text-warm/80"
                >
                  Tickets shared of {formatTierNumber(goal)} goal
                </p>
              </section>

              {/* Milestones — quiet permanent hallmarks. The ENTIRE block is
                  absent until the first tier is crossed (founder amendment
                  B): no label, no placeholder, no celebration. */}
              {crossed.length > 0 && (
                <div className="mt-7 text-left">
                  <p className="font-sans font-normal text-[0.8125rem] uppercase tracking-[0.18em] text-warm/60">
                    Milestones passed
                  </p>
                  {/* Founder amendment 2026-07-23: no interpunct separators —
                      the groups are separated by spacing alone. */}
                  <p className="mt-2 flex flex-wrap gap-x-[1.25em] gap-y-1 font-sans font-normal text-[0.8125rem] tracking-[0.14em] text-warm/75">
                    {crossed.map((tier) => (
                      <span key={tier}>
                        <span
                          aria-hidden
                          className="pr-[0.3em] tracking-normal text-accent opacity-50"
                        >
                          ✦
                        </span>
                        {formatTierNumber(tier)}
                      </span>
                    ))}
                  </p>
                </div>
              )}

              {/* The act + the law, grouped. The CTA is the page's ONLY
                  solid-filled object; it opens the pass-it-on modal
                  (arriving in Phase 4). */}
              <div>
                <button
                  ref={ctaRef}
                  type="button"
                  aria-haspopup="dialog"
                  aria-controls="passiton-modal"
                  onClick={() => setShareOpen(true)}
                  className="mt-6 block min-h-[52px] w-full cursor-pointer touch-manipulation border border-accent bg-accent px-6 py-[0.9375rem] font-sans font-normal text-[0.8125rem] uppercase tracking-[0.28em] text-ink transition-colors duration-300 hover:border-[rgba(177,161,128,0.88)] hover:bg-[rgba(177,161,128,0.88)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[3px] focus-visible:outline-accent min-[900px]:mt-9"
                >
                  Pass it on
                </button>
                {chainLength >= 1 && (
                  <div className="mt-5">
                    {/* Founder amendments 2026-07-23: raised twice from the
                        replica's 0.875rem — now 1rem. Everything else
                        unchanged. */}
                    <p className="font-serif-v3 italic text-[1rem] leading-[1.6] text-warm/65">
                      This film passed through {pairsOfHandsPhrase(chainLength)} to reach you.
                      You are its newest link{' '}—{' '}
                      <span className="text-accent">or{' '}its{' '}last.</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ══ The creed — hairline band, three marks, three statements.
            Founder-provided copy, verbatim (2026-07-23 revision). ══ */}
        <section
          aria-label="How films travel here"
          className="mt-12 border-y border-warm/15 py-[clamp(2rem,4svh,2.75rem)] min-[900px]:mt-[clamp(1.75rem,4svh,2.5rem)]"
        >
          <div className="grid grid-cols-1 gap-y-11 min-[900px]:grid-cols-3 min-[900px]:gap-x-16">
            <div className="text-center">
              {/* The hand-off: one gift between two real people (solid = arrived). */}
              <div className="flex h-5 items-center justify-center">
                <svg className="h-5 w-auto text-accent opacity-45" viewBox="0 0 30 20" aria-hidden>
                  <line x1="5" y1="10" x2="25" y2="10" stroke="currentColor" strokeWidth="1.1" />
                  <circle cx="5" cy="10" r="2.2" fill="currentColor" />
                  <circle cx="25" cy="10" r="2.2" fill="currentColor" />
                </svg>
              </div>
              <p className="mx-auto mt-3.5 max-w-[22rem] font-serif-v3 italic text-[1.125rem] leading-[1.7] text-warm/80">
                Films here spread by private invite and real humans only. No algorithms.
              </p>
            </div>

            <div className="text-center">
              {/* The fan: the chain extends; hollow tips only exist if you pass it on. */}
              <div className="flex h-5 items-center justify-center">
                <svg className="h-5 w-auto text-accent opacity-45" viewBox="0 0 50 20" aria-hidden>
                  <line x1="5" y1="10" x2="19" y2="10" stroke="currentColor" strokeWidth="1.1" />
                  <line x1="19" y1="10" x2="33" y2="3.5" stroke="currentColor" strokeWidth="1.1" />
                  <line x1="19" y1="10" x2="37" y2="10" stroke="currentColor" strokeWidth="1.1" />
                  <line x1="19" y1="10" x2="33" y2="16.5" stroke="currentColor" strokeWidth="1.1" />
                  <circle cx="5" cy="10" r="2.2" fill="currentColor" />
                  <circle cx="19" cy="10" r="2.2" fill="currentColor" />
                  <circle cx="34" cy="3" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="39" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="34" cy="17" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </div>
              <p className="mx-auto mt-3.5 max-w-[22rem] font-serif-v3 italic text-[1.125rem] leading-[1.7] text-warm/80">
                This film won’t reach anyone new, unless{' '}
                <span className="text-accent">you</span> pass it on.
              </p>
            </div>

            <div className="text-center">
              {/* The ticket stub — the instrument of the law beneath it. */}
              <div className="flex h-5 items-center justify-center">
                <svg className="h-5 w-auto text-accent opacity-45" viewBox="0 0 32 20" aria-hidden>
                  <path
                    d="M2 2 h28 v5 a3 3 0 0 0 0 6 v5 h-28 v-5 a3 3 0 0 0 0-6 z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              </div>
              <p className="mx-auto mt-3.5 max-w-[22rem] font-serif-v3 italic text-[1.125rem] leading-[1.7] text-warm/80">
                Share intentionally. Each ticket admits one person only.
              </p>
            </div>
          </div>
        </section>

        {/* ══ The story — the filmmaker's note. Per-film content from
            src/content/filmStory.js; a film with no entry renders NOTHING
            here (no frame, no eyebrow — never invented copy). ══ */}
        {story && (
          <section
            aria-label="Filmmaker"
            className="mx-auto mt-12 w-full max-w-[42rem] text-left min-[900px]:mt-[clamp(3rem,6svh,4.5rem)]"
          >
            <div className="flex items-end gap-4">
              {/* The photo frame — hairline circle on the track tint; the
                  filmmaker's real photo drops into this frame when it
                  exists (src/content/filmStory.js). */}
              <div
                aria-hidden
                className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-warm/15 bg-tint-track min-[900px]:h-24 min-[900px]:w-24"
              >
                {story.filmmakerPhotoUrl && (
                  /* Slight zoom-in so the face fills more of the circle;
                     the frame's overflow-hidden clips the excess. */
                  <img
                    src={story.filmmakerPhotoUrl}
                    alt=""
                    className="h-full w-full scale-[1.12] object-cover"
                  />
                )}
              </div>
              {/* Header restructure (founder-approved 2026-07-25):
                  "Filmmaker · {name} · {location}" — the name moved up
                  from the retired sign-off. Each "· phrase" is one
                  unbreakable unit, so narrow viewports break at the "·"
                  boundaries, never mid-phrase beside the photo. */}
              <p className="pb-[0.3125rem] font-sans font-normal text-[11px] uppercase tracking-[0.32em] text-muted">
                Filmmaker
                {story.filmmakerName && (
                  <>
                    {' '}
                    <span className="whitespace-nowrap">·{' '}{story.filmmakerName}</span>
                  </>
                )}
                {story.filmmakerLocation && (
                  <>
                    {' '}
                    <span className="whitespace-nowrap">·{' '}{story.filmmakerLocation}</span>
                  </>
                )}
              </p>
            </div>

            <p className="mt-7 max-w-[34rem] font-serif-v3 italic text-[clamp(1.25rem,2vw,1.4375rem)] leading-[1.55] text-warm/90">
              {story.epigraph}
            </p>

            <div className="mt-7 max-w-[62ch]">
              {story.body.map((paragraph, i) => (
                <p
                  key={i}
                  className={`${i > 0 ? 'mt-[1.375rem] ' : ''}font-sans font-light text-[1.0625rem] leading-[1.85] text-warm/80`}
                >
                  {paragraph}
                </p>
              ))}
            </div>

            {/* The sign-off was CUT 2026-07-25 (founder): the name lives in
                the header only — the section ends with the body text. */}
          </section>
        )}
      </main>

      {/* ══ Footer — the quiet persistent dashboard link. ══ */}
      <footer className="relative z-10 pb-[max(clamp(2.5rem,6vh,4rem),env(safe-area-inset-bottom,0px))] pt-[clamp(2rem,5vh,3rem)] text-center">
        <Link
          to="/dashboard"
          className="font-sans font-normal text-xs uppercase tracking-[0.26em] text-muted transition-colors hover:text-warm"
        >
          Your dashboard →
        </Link>
      </footer>

      {/* ══ The pass-it-on modal — the ticket window (spec §4). ══ */}
      {shareOpen && (
        <PassItOnModal
          onClose={closeShare}
          granted={INITIAL_CLAIMANT_TICKETS}
          remaining={stubBalance}
          tickets={tickets}
          outOfTickets={outOfTickets}
          shareName={shareName}
          onNameChange={setShareName}
          shareBusy={shareBusy}
          shareError={shareError}
          onSubmit={handleGenerate}
          hands={hands}
          handForks={handForks}
          generated={generated}
          copied={copied}
          onCopy={handleCopy}
          onAgain={handleShareAgain}
        />
      )}
    </div>
  )
}
