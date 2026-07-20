/**
 * Viewer dashboard V5 — the redesign from design-refs/deepcast-dashboard-v5.html.
 *
 * Presentational only: Dashboard.jsx keeps every query, gate, and handler and
 * hands this component plain values. The identity gate (spinner / visitor
 * screen) also stays in Dashboard.jsx — by the time this renders, a profile
 * (real or claimant pseudo-profile) always exists.
 *
 * Phase 1 = the shell: sidebar, mobile bar + menu, screening cards, share CTA.
 * The journey line, constellation, ticket rows, and ticket numbers arrive in
 * their own phases and mount inside <main> below the screening section.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import DeepcastLogo from '../components/DeepcastLogo'
import MvpVersionLabel from '../components/MvpVersionLabel'
import { screeningCardState } from '../lib/screeningCard.js'
import { buildTicketRows } from '../lib/ticketRows.js'
import { buildJourneyLine } from '../lib/journeyLine.js'
import { buildConstellationLayout } from '../lib/constellationLayout.js'
import ConstellationMap from '../components/ConstellationMap'
import { safeLocalStorage } from '../lib/safeStorage.js'

const CONTACT_EMAIL = 'hello@deepcast.art'

const sideLinkClass =
  'text-left font-sans text-[0.6875rem] uppercase tracking-[0.22em] text-smoke transition-colors hover:text-mist'

/** Inline first-name editor — same behavior as before the redesign; rendered in
 *  the desktop sidebar and inside the mobile menu overlay (one visible at a time). */
function NameEditor({ editor }) {
  if (!editor.editing) {
    return (
      <button type="button" onClick={editor.start} className={sideLinkClass}>
        Edit your first name
      </button>
    )
  }
  return (
    <div className="flex w-full max-w-xs flex-col gap-2.5 text-left">
      <span className="font-sans text-[0.5625rem] uppercase tracking-[0.22em] text-smoke">
        First name
      </span>
      <input
        type="text"
        value={editor.draft}
        onChange={(e) => editor.setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') editor.save()
          if (e.key === 'Escape') editor.cancel()
        }}
        maxLength={50}
        autoFocus
        aria-label="First name"
        className="w-full border-b border-mist/20 bg-transparent pb-1 font-serif-v3 text-base italic text-mist placeholder-mist/30 focus:border-gold/60 focus:outline-none"
        placeholder="First name"
      />
      <p className="font-serif-v3 text-xs italic text-smoke">
        This is how your name appears on the network.
      </p>
      {editor.error && (
        <p className="font-sans text-[0.5625rem] uppercase tracking-[0.18em] text-error/90">
          {editor.error}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={editor.save}
          disabled={editor.busy}
          className="font-sans text-[0.625rem] uppercase tracking-[0.22em] text-gold transition-colors hover:text-gold-soft disabled:opacity-50"
        >
          {editor.busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={editor.cancel}
          disabled={editor.busy}
          className="font-sans text-[0.625rem] uppercase tracking-[0.22em] text-smoke transition-colors hover:text-mist disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function ViewerDashboardV5({
  profile,
  isClaimant,
  loading,
  inviteSentConfirmation,
  films,
  selectedFilmId,
  claimStashSlug,
  ticketNo,
  sentInvites,
  filmInvites,
  creatorId,
  creatorName,
  viewerInviteId,
  ticketsRemaining,
  ticketsGiven,
  canShare,
  shareDisabled,
  onShare,
  nameEditor,
  onSignOut,
}) {
  const navigate = useNavigate()
  /** Mobile menu ALWAYS starts closed and never auto-opens (standing rule). */
  const [menuOpen, setMenuOpen] = useState(false)
  /** Which ticket row's copy button is in its transient feedback state. */
  const [copyFeedback, setCopyFeedback] = useState(null) // { id, label }

  const ticketRows = useMemo(
    () =>
      buildTicketRows({
        sentInvites: sentInvites || [],
        filmInvites: filmInvites || [],
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      }),
    [sentInvites, filmInvites]
  )

  const constellation = useMemo(
    () =>
      buildConstellationLayout({
        filmInvites: filmInvites || [],
        creatorId,
        creatorName,
        viewerInviteId,
      }),
    [filmInvites, creatorId, creatorName, viewerInviteId]
  )

  // The journey line's counts come from the constellation's tree — ONE
  // counting path (owner rule 2026-07-21): X = film-wide generated total,
  // Y = the viewer's entire downstream, all depths.
  const journey = useMemo(
    () =>
      buildJourneyLine({
        reached: constellation?.inviteCount ?? 0,
        downstream: constellation?.viewerDownstreamCount ?? 0,
      }),
    [constellation]
  )

  const copyTicketLink = async (ticketRow) => {
    try {
      await navigator.clipboard.writeText(ticketRow.link)
      setCopyFeedback({ id: ticketRow.id, label: 'Copied' })
    } catch {
      // Clipboard blocked (Safari restrictions) — show the link itself so it
      // can be selected by hand; never fail silently.
      setCopyFeedback({ id: ticketRow.id, label: ticketRow.link })
    }
    setTimeout(() => setCopyFeedback(null), 1800)
  }

  const name = profile.name?.trim() || 'Welcome'
  const remainingDisplay =
    ticketsRemaining === Infinity ? 'Unlimited' : (ticketsRemaining ?? '—')
  const mobileLine =
    ticketsRemaining === Infinity
      ? `Unlimited tickets · ${ticketsGiven} given`
      : ticketsRemaining == null
        ? `${ticketsGiven} tickets given`
        : `${ticketsRemaining} tickets remaining · ${ticketsGiven} given`

  const shareCtaClass =
    'w-full border border-gold bg-gold px-4 py-[1.125rem] text-center font-sans text-[0.8125rem] uppercase tracking-[0.26em] text-ink transition-colors duration-300 hover:bg-transparent hover:text-gold-soft focus-visible:bg-transparent focus-visible:text-gold-soft focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gold disabled:hover:text-ink'

  const menuLinks = (
    <>
      {!isClaimant && (
        <Link to="/about" className={sideLinkClass} onClick={() => setMenuOpen(false)}>
          About Deepcast
        </Link>
      )}
      <a href={`mailto:${CONTACT_EMAIL}`} className={sideLinkClass}>
        Contact
      </a>
      {!isClaimant && <NameEditor editor={nameEditor} />}
      {!isClaimant && (
        <button type="button" onClick={onSignOut} className={sideLinkClass}>
          Sign out
        </button>
      )}
    </>
  )

  return (
    <div className="relative min-h-dvh bg-bg-page font-serif-v3 text-mist">
      {/* Film grain, per the V5 design (the watch page stays grain-free). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] opacity-80"
        style={{ backgroundImage: 'var(--grain)' }}
      />

      {/* ── Mobile top bar ── */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-mist/[0.12] bg-bg-page/90 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top,0px))] backdrop-blur-md md:hidden">
        <Link to="/" aria-label="Deepcast" className="opacity-90 hover:opacity-100">
          <DeepcastLogo size="text-xl" className="text-mist" />
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="min-h-[44px] touch-manipulation px-1.5 font-sans text-[0.6875rem] uppercase tracking-[0.22em] text-mist"
        >
          Menu
        </button>
      </div>

      {/* ── Mobile menu overlay ── */}
      {menuOpen && (
        <nav
          aria-label="Menu"
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-bg-page/95 px-8 backdrop-blur-sm md:hidden"
        >
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="absolute right-6 top-6 min-h-[44px] touch-manipulation font-sans text-[0.6875rem] uppercase tracking-[0.22em] text-smoke"
          >
            Close
          </button>
          {menuLinks}
        </nav>
      )}

      <div className="relative z-[2] mx-auto grid max-w-[90rem] md:min-h-dvh md:grid-cols-[18rem_1fr]">
        {/* ── Sidebar (desktop) ── */}
        <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-mist/[0.12] px-8 py-8 md:flex">
          <Link to="/" aria-label="Deepcast" className="opacity-90 hover:opacity-100">
            <DeepcastLogo size="text-2xl" className="text-mist" />
          </Link>

          <div className="mt-8">
            <p className="font-serif-v3 text-[1.75rem] italic leading-tight text-mist">{name}</p>
            {ticketNo != null && (
              <p className="mt-2 font-sans text-[0.6875rem] uppercase tracking-[0.26em] text-gold">
                Ticket No. {ticketNo}
              </p>
            )}
          </div>

          <div className="mt-7 flex flex-col gap-4 border-t border-mist/[0.12] pt-6">
            <div className="flex items-baseline gap-3">
              <p className="min-w-5 font-sans text-2xl font-light leading-none text-gold-soft">
                {remainingDisplay}
              </p>
              <p className="font-sans text-[0.625rem] uppercase tracking-[0.22em] text-smoke">
                Tickets remaining
              </p>
            </div>
            <div className="flex items-baseline gap-3">
              <p className="min-w-5 font-sans text-2xl font-light leading-none text-gold-soft">
                {ticketsGiven}
              </p>
              <p className="font-sans text-[0.625rem] uppercase tracking-[0.22em] text-smoke">
                Tickets given
              </p>
            </div>
          </div>

          {/* Founder-approved verbatim (2026-07-21) — the sidebar's quiet aside.
              (The share surfaces keep their own approved constraint line.) */}
          <p className="mt-6 font-serif-v3 text-sm italic leading-relaxed text-smoke/80">
            This film reached you because someone thought of you. No algorithm, no feed. Films here
            spread by private invite &amp; real humans only.
          </p>

          {canShare && (
            <button type="button" onClick={onShare} disabled={shareDisabled} className={`mt-7 ${shareCtaClass}`}>
              Share this film
            </button>
          )}

          {/* Pinned to the sidebar's bottom edge: even if the middle ever
              overflows (short window, browser zoom), these links can never
              slip below an invisible internal scroll. */}
          <div className="sticky bottom-0 -mx-8 mt-auto flex flex-col gap-3.5 bg-bg-page px-8 pb-0.5 pt-6">
            {menuLinks}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="min-w-0 px-[clamp(1.375rem,4vw,3.5rem)] pb-32 pt-6 md:pb-20 md:pt-11">
          {/* Mobile identity block */}
          <div className="mb-7 md:hidden">
            <p className="font-serif-v3 text-[1.625rem] italic leading-tight text-mist">{name}</p>
            <p className="mt-2 font-sans text-[0.65rem] uppercase tracking-[0.2em] text-smoke">
              {ticketNo != null && <b className="font-normal text-gold">Ticket No. {ticketNo} · </b>}
              {mobileLine}
            </p>
          </div>

          {inviteSentConfirmation && (
            <div className="mb-8 border border-success/30 bg-success/10 px-6 py-4">
              <p className="font-sans text-[0.6875rem] uppercase tracking-[0.25em] text-success">
                Invitation sent to {inviteSentConfirmation} — they&apos;ll receive a private
                screening link.
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent"
                aria-hidden
              />
            </div>
          ) : !selectedFilmId ? (
            <div className="mx-auto max-w-lg py-20 text-center">
              <p className="font-serif-v3 text-base italic text-smoke">
                You&apos;re signed in. Open a screening link from your email to connect a film to
                this dashboard; then you can track shares and send invitations.
              </p>
              <Link
                to="/profile"
                className="mt-8 inline-block font-sans text-[0.6875rem] uppercase tracking-[0.22em] text-gold transition-colors hover:text-gold-soft"
              >
                Profile
              </Link>
            </div>
          ) : (
            <>
              {/* ── Screening ── */}
              {films.length > 0 && (
                <section>
                  <p className="font-sans text-[0.625rem] uppercase tracking-[0.3em] text-smoke">
                    Your screening{films.length > 1 ? 's' : ''}
                  </p>
                  <div className="mt-5 flex flex-col gap-3">
                    {films.map((film) => {
                      // Claim-flow films route by slug (the stash for a claimant,
                      // the invite's own link_slug for a signed-in claim holder);
                      // legacy email invites route by token. Same rules as before
                      // the redesign — resume keys are slug- or token-scoped.
                      const claimSlug = (isClaimant && claimStashSlug) || film.linkSlug || null
                      const posKey = claimSlug
                        ? `screening_position_slug_${claimSlug}`
                        : `screening_position_${film.token}`
                      const card = screeningCardState({
                        status: film.status,
                        savedSeconds: Number(safeLocalStorage.getItem(posKey)) || 0,
                        progressFraction: claimSlug
                          ? Number(safeLocalStorage.getItem(`screening_progress_slug_${claimSlug}`)) ||
                            null
                          : null,
                      })
                      const statusLabel =
                        card.mode === 'again'
                          ? 'Watched'
                          : card.resumeSeconds > 0
                            ? 'In progress'
                            : 'Unwatched'
                      const goWatch = () => {
                        if (claimSlug) {
                          navigate(
                            card.mode === 'again' ? `/watch/${claimSlug}?again=1` : `/watch/${claimSlug}`
                          )
                          return
                        }
                        if (!film.token) return
                        navigate(
                          card.mode === 'resume' && card.resumeSeconds > 0
                            ? `/i/${film.token}?play=1&t=${card.resumeSeconds}`
                            : `/i/${film.token}?play=1`
                        )
                      }
                      return (
                        <div
                          key={film.id}
                          role="button"
                          tabIndex={0}
                          onClick={goWatch}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              goWatch()
                            }
                          }}
                          className="relative flex cursor-pointer items-center gap-3.5 border border-mist/[0.12] bg-ink-2 p-3.5 transition-colors hover:border-mist/25 md:gap-6 md:p-5"
                        >
                          {/* Thin quiet progress indicator (in-progress cards only). */}
                          {card.progress != null && (
                            <div aria-hidden className="absolute bottom-0 left-0 right-0 h-[2px] bg-mist/10">
                              <div
                                className="h-full bg-gold/70"
                                style={{ width: `${Math.round(card.progress * 100)}%` }}
                              />
                            </div>
                          )}
                          <div className="relative aspect-video w-20 shrink-0 md:w-36">
                            {film.thumbnail_url ? (
                              // The global `img { height: auto }` rule defeats
                              // Tailwind height utilities — inline height wins.
                              <img
                                src={film.thumbnail_url}
                                alt={film.title}
                                className="absolute inset-0 h-full w-full object-cover"
                                style={{ height: '100%' }}
                              />
                            ) : (
                              <div className="absolute inset-0 bg-gradient-to-b from-[#b99e78] via-[#6b5d47] to-[#14170f]" />
                            )}
                            <span className="absolute inset-0 m-auto flex h-7 w-7 items-center justify-center rounded-full border border-mist/55 bg-ink/55">
                              <svg className="h-2.5 w-2.5 fill-mist" viewBox="0 0 24 24" aria-hidden>
                                <path d="M9 6l9 6-9 6z" />
                              </svg>
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-serif-v3 text-[1.1875rem] italic leading-tight text-mist md:text-2xl">
                              {film.title}
                            </p>
                            <p className="mt-1 font-sans text-[0.5625rem] uppercase tracking-[0.24em] text-smoke md:mt-1.5 md:text-[0.65rem]">
                              {statusLabel}
                              {films.length > 1 && film.id === selectedFilmId && (
                                <span className="text-gold"> · Viewing</span>
                              )}
                            </p>
                          </div>
                          {(film.token || claimSlug) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                goWatch()
                              }}
                              className="shrink-0 whitespace-nowrap border border-gold/45 px-3 py-3 font-sans text-[0.65rem] uppercase tracking-[0.14em] text-gold-soft transition-colors duration-300 hover:border-gold hover:bg-gold hover:text-ink md:px-7 md:py-[0.9375rem] md:text-xs md:tracking-[0.24em]"
                            >
                              {card.label}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* ── The constellation (journey line now; the map mounts here next) ── */}
              {journey.reached > 0 && (
                <section className="mt-12 md:mt-16">
                  <p className="font-sans text-[0.625rem] uppercase tracking-[0.3em] text-smoke">
                    Where your film has traveled
                  </p>
                  <p className="mt-5 font-serif-v3 text-[clamp(1.1875rem,2.6vw,1.4375rem)] italic leading-normal text-mist">
                    {journey.segments.map((seg, i) =>
                      seg.bold ? (
                        <b key={i} className="font-medium text-gold-soft">
                          {seg.text}
                        </b>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      )
                    )}
                  </p>
                  {constellation && (
                    <ConstellationMap
                      key={`${constellation.width}x${constellation.height}`}
                      layout={constellation}
                    />
                  )}
                </section>
              )}

              {/* ── Your tickets (always present — the section is the home of
                    the ask, even before the first link exists) ── */}
              <section className="mt-12 md:mt-16">
                <p className="font-sans text-[0.625rem] uppercase tracking-[0.3em] text-smoke">
                  Your tickets
                </p>
                {ticketRows.length === 0 ? (
                  <p className="mt-5 border-t border-mist/[0.12] pt-6 font-serif-v3 text-base italic text-smoke">
                    No tickets given yet.
                  </p>
                ) : (
                  <div className="mt-5 border-t border-mist/[0.12]">
                    {ticketRows.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-wrap items-center gap-5 border-b border-mist/[0.12] px-1 py-[1.375rem]"
                      >
                        <div className="min-w-[9rem] flex-1">
                          {t.ticketNo != null && (
                            <p className="font-sans text-[0.5625rem] uppercase tracking-[0.26em] text-smoke">
                              Ticket No. {t.ticketNo}
                            </p>
                          )}
                          <p className="mt-1 font-serif-v3 text-[1.4375rem] italic leading-tight text-mist">
                            {t.name}
                          </p>
                        </div>
                        <span className="inline-flex min-w-0 items-center gap-2.5 font-sans text-[0.65rem] uppercase tracking-[0.22em] text-smoke md:min-w-[10rem]">
                          <span
                            aria-hidden
                            className={`h-2 w-2 shrink-0 rounded-full border ${
                              t.statusKind === 'shared'
                                ? 'border-gold bg-gold shadow-[0_0_0_3px_rgba(199,169,107,0.2)]'
                                : t.statusKind === 'watched'
                                  ? 'border-gold bg-gold'
                                  : t.statusKind === 'opened'
                                    ? 'border-smoke bg-smoke'
                                    : 'border-gold/45'
                            }`}
                          />
                          {t.statusLabel}
                        </span>
                        {t.link && (
                          <button
                            type="button"
                            onClick={() => copyTicketLink(t)}
                            className="min-w-0 break-all py-1.5 text-left font-sans text-[0.65rem] uppercase tracking-[0.22em] text-gold transition-colors hover:text-gold-soft"
                          >
                            {copyFeedback?.id === t.id ? copyFeedback.label : 'Copy invitation link'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <footer className="mt-20 text-center font-sans text-[0.625rem] uppercase tracking-[0.22em] text-smoke/70">
                &copy; {new Date().getFullYear()}{' '}
                <span className="font-sans normal-case">Deepcast</span>.
                <MvpVersionLabel className="mt-2" />
              </footer>
            </>
          )}
        </main>
      </div>

      {/* ── Mobile bottom share bar ── */}
      {canShare && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-mist/[0.12] bg-bg-page/90 px-5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))] pt-3.5 backdrop-blur-md md:hidden">
          <button type="button" onClick={onShare} disabled={shareDisabled} className={shareCtaClass}>
            Share this film
          </button>
        </div>
      )}
    </div>
  )
}
