import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import CreatorLinkPanel from '../components/CreatorLinkPanel'
import TicketControlsPopover from '../components/TicketControlsPopover'
import RemovePersonPopover from '../components/RemovePersonPopover'
import DeepcastLogo from '../components/DeepcastLogo'
import MvpVersionLabel from '../components/MvpVersionLabel'
import NetworkGraph from '../components/NetworkGraph'
import { buildGraphLayout, resolveViewerFocus } from '../lib/graphLayout'
import { api } from '../lib/api'
import { ensureHttpsUrl } from '../lib/httpsUrl.js'
// Canonical share quota + per-film stats — one shared computation per stat.
import { filmTicketsRemaining } from '../lib/shares.js'
import { computeTicketFunnel } from '../lib/ticketFunnel.js'
import { buildNetworkPeople } from '../lib/networkPeople.js'
import { safeLocalStorage, safeSessionStorage } from '../lib/safeStorage.js'
import { readClaimStash } from '../lib/claimStash.js'
import { countTicketsGiven } from '../lib/inviteExistence.js'
import ViewerDashboardV5 from './ViewerDashboardV5'
import ShareLinkModal from '../components/ShareLinkModal'

export default function Dashboard() {
  const { profile: authProfile, signOut, fetchProfile, profileLoaded } = useAuth()
  const location = useLocation()

  /* ── Claimant mode (final spec 2026-07-16): an accountless claimant's
     identity is their claimed invite (safeStorage stash → invite row). We
     synthesize a viewer-shaped pseudo-profile so the whole viewer path below
     works unchanged; account-only affordances (name edit, sign out, About,
     the email share modal) are hidden for claimants further down. ── */
  const claimStash = useMemo(() => (authProfile ? null : readClaimStash()), [authProfile])
  const [claimantInvite, setClaimantInvite] = useState(null)
  /** true once the claimant-invite lookup has settled (found OR missing) —
   *  the render gate below needs to tell "still resolving" from "no such
   *  invite" so no identity state can ever render a blank page. */
  const [claimantLookupDone, setClaimantLookupDone] = useState(false)
  useEffect(() => {
    if (!claimStash?.inviteId) return
    let cancelled = false
    supabase
      .from('invites')
      .select('*')
      .eq('id', claimStash.inviteId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setClaimantInvite(data || null)
        setClaimantLookupDone(true)
      })
      .catch(() => {
        if (!cancelled) setClaimantLookupDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [claimStash?.inviteId])

  const profile = useMemo(() => {
    if (authProfile) return authProfile
    if (!claimStash || !claimantInvite) return null
    return {
      id: null,
      email: claimStash.claimedEmail || claimantInvite.claimed_email || '',
      name: claimantInvite.recipient_name || '',
      role: 'viewer',
      isClaimant: true,
      claimedInviteId: claimantInvite.id,
      claimedInviteToken: claimantInvite.token || null,
      claim_ordinal: claimantInvite.claim_ordinal ?? null,
      /** The silent account behind this claim (Piece E) — the id today's link
       *  generations stamp into sender_id. NULL only for legacy accountless
       *  claims, whose sends really do carry a NULL sender_id. */
      claimedBy: claimantInvite.claimed_by ?? null,
      claimedFilmId: claimantInvite.film_id,
      claimedStatus: claimantInvite.status || null,
      claimedSlug: claimStash.slug,
      claimedTicketNo: claimantInvite.ticket_no ?? null,
    }
  }, [authProfile, claimStash, claimantInvite])
  const isClaimant = Boolean(profile?.isClaimant)
  const inviteSentConfirmation = location.state?.inviteSent
    ? location.state.recipientName || 'your invitee'
    : null
  const [films, setFilms] = useState([])
  const [filmStats, setFilmStats] = useState({})
  const [loading, setLoading] = useState(() => !profileLoaded || Boolean(readClaimStash()))
  const [inviteFilmId, setInviteFilmId] = useState(null)
  const [copiedTicketId, setCopiedTicketId] = useState(null)
  const [filmInvitesRaw, setFilmInvitesRaw] = useState({})
  // The users rows already loaded for the films' senders — the admin table
  // resolves names/accounts from these (no extra queries).
  const [filmSenderUsers, setFilmSenderUsers] = useState([])

  const [leadCreatorName, setLeadCreatorName] = useState('')
  const [teamEmail, setTeamEmail] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamMessage, setTeamMessage] = useState('')
  const [teamInvites, setTeamInvites] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [teamRemoveBusyId, setTeamRemoveBusyId] = useState(null)
  /** Mobile menus always START closed and never auto-open — the dashboard's main
   *  page is the initial view (key stats live in the mobile strip; the menu is
   *  navigation only). Desktop sidebars are always visible and unaffected.
   *  (The viewer V5 shell owns its own mobile-menu state internally.) */
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [allViewerSentInvites, setAllViewerSentInvites] = useState([])
  const [viewerFilmId, setViewerFilmId] = useState(
    () => safeSessionStorage.getItem('dash_viewer_film_id') || null
  )
  // Film title is display-unused in the V5 design; the setter keeps the
  // loaders unchanged. Creator id/name feed the constellation layout.
  const [, setViewerFilmTitle] = useState('')
  const [viewerFilmCreatorId, setViewerFilmCreatorId] = useState(null)
  const [viewerInviteToken, setViewerInviteToken] = useState(null)
  const [viewerFilmInvites, setViewerFilmInvites] = useState([])
  const [viewerAllFilms, setViewerAllFilms] = useState([])
  const [viewerCreatorName, setViewerCreatorName] = useState('')
  const [viewerTokenByFilmId, setViewerTokenByFilmId] = useState({})

  const viewerSentInvites = useMemo(
    () => allViewerSentInvites.filter((inv) => inv.film_id === viewerFilmId),
    [allViewerSentInvites, viewerFilmId]
  )

  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  /** Bumped after a claimant generates a link so their server-computed
   *  balance refetches (the effect below keys on it). */
  const [claimantBalanceVersion, setClaimantBalanceVersion] = useState(0)

  /** Owner-only ticket controls (Piece B): per-USER-ID wallet state from the
   *  batched admin endpoint ({ name, unlimited, ticketsLeft, controllable,
   *  reason }). Stays empty for anyone the server rejects (pinned to
   *  ADMIN_USER_ID server-side), so no controls render for non-owner accounts. */
  const [ticketStatuses, setTicketStatuses] = useState({})
  /** Which person's popover is open: { userId, rect } (fixed-position anchor). */
  const [controlsOpenFor, setControlsOpenFor] = useState(null)
  /** Delete-with-splice confirm surface: { key, rect, filmId, target }. */
  const [removeOpenFor, setRemoveOpenFor] = useState(null)
  const [controlsBusy, setControlsBusy] = useState(false)
  const [controlsError, setControlsError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState('')

  const isTeamMember = profile?.role === 'team_member'
  const filmOwnerId =
    profile?.role === 'team_member' ? profile?.team_creator_id : profile?.id
  const isViewer = profile?.role === 'viewer'

  /** Canonical quota, surfaced as TICKETS — PER-FILM since Piece F: the
   *  sidebar shows the SELECTED film's wallet (own film_tickets row, readable
   *  under RLS; a missing row is the virtual full grant), finally matching
   *  "Tickets given" which was always per-film. */
  const [viewerFilmWallet, setViewerFilmWallet] = useState(null)

  /** Sessionless claimants (fix 2026-07-19): the balance comes from the SAME
   *  server-computed source the watch page trusts — the public link route,
   *  which resolves the per-film wallet for account-backed claims and the
   *  legacy invite wallet for accountless ones. The old read of the invite
   *  row's tickets_remaining showed a stale "5" for every account-backed
   *  claimant (their spends debit film_tickets, never that column). A failed
   *  lookup displays NOTHING — never a wrong number. */
  const [claimantTicketsLeft, setClaimantTicketsLeft] = useState(null)
  useEffect(() => {
    if (!isClaimant || !claimStash?.slug) {
      setClaimantTicketsLeft(null)
      return
    }
    let cancelled = false
    api
      .getLinkInvite(claimStash.slug)
      .then((data) => {
        if (!cancelled) setClaimantTicketsLeft(data?.ticketsRemaining ?? null)
      })
      .catch(() => {
        if (!cancelled) setClaimantTicketsLeft(null)
      })
    return () => {
      cancelled = true
    }
  }, [isClaimant, claimStash?.slug, claimantBalanceVersion])
  useEffect(() => {
    if (!isViewer || isClaimant || !profile?.id || !viewerFilmId) {
      setViewerFilmWallet(null)
      return
    }
    let cancelled = false
    supabase
      .from('film_tickets')
      .select('balance, unlimited')
      .eq('user_id', profile.id)
      .eq('film_id', viewerFilmId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setViewerFilmWallet(data ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [isViewer, isClaimant, profile?.id, viewerFilmId])

  const invitesLeft = !isViewer
    ? null
    : isClaimant
      ? claimantTicketsLeft
      : filmTicketsRemaining(profile, viewerFilmWallet)
  // "Tickets given" — voided (refunded) duplicate links no longer count.
  const sentCount = isViewer ? countTicketsGiven(viewerSentInvites) : 0
  // V5 (owner decision 2026-07-20): the dashboard share button is the LINK
  // flow for every viewer, claimants included — the email modal is gone.
  const canShareMore = Boolean(isViewer && viewerFilmId)
  const shareDisabled = isClaimant
    ? claimantTicketsLeft !== null && claimantTicketsLeft <= 0
    : isViewer && filmTicketsRemaining(profile, viewerFilmWallet) <= 0

  // Shared focus resolution (same helper every graph surface uses): email match first,
  // then invite-token match, then the common parent of the viewer's sent invites.
  const { focusInviteId: viewerFocusInviteId } = useMemo(
    () =>
      resolveViewerFocus(viewerFilmInvites, profile?.email, {
        // Claimants: their claimed invite's token is the reliable focus key —
        // the claimed row has no recipient_email for the email match to find.
        inviteToken: profile?.claimedInviteToken || viewerInviteToken,
        viewerUserId: profile?.id,
      }),
    [viewerFilmInvites, profile?.email, profile?.claimedInviteToken, viewerInviteToken, profile?.id]
  )

  const selectViewerFilm = useCallback(async (filmId) => {
    if (!filmId) {
      setViewerFilmId(null)
      safeSessionStorage.removeItem('dash_viewer_film_id')
      setViewerFilmTitle('')
      setViewerFilmInvites([])
      setViewerCreatorName('')
      setViewerFilmCreatorId(null)
      setViewerInviteToken(null)
      return
    }

    setViewerFilmId(filmId)
    safeSessionStorage.setItem('dash_viewer_film_id', filmId)

    // Film row and the film's invites are independent — fetch together. Round trips from the
    // browser to the database are the cost here, not the queries themselves.
    const [{ data: filmRow }, { data: allInv }] = await Promise.all([
      supabase
        .from('films')
        .select('id, title, thumbnail_url, creator_id')
        .eq('id', filmId)
        .single(),
      supabase.from('invites').select('*').eq('film_id', filmId),
    ])

    setViewerFilmTitle(filmRow?.title || '')
    setViewerFilmInvites(allInv || [])
    setViewerFilmCreatorId(filmRow?.creator_id || null)

    let cname = ''
    if (filmRow?.creator_id) {
      // maybeSingle: viewers can't read the creator's profile under RLS — zero rows
      // is expected, not an error (the graph keys off creator_id, not the name).
      const { data: cr } = await supabase
        .from('users')
        .select('name')
        .eq('id', filmRow.creator_id)
        .maybeSingle()
      cname = cr?.name || ''
    }
    setViewerCreatorName(cname)

    const filmToken = viewerTokenByFilmId[filmId]
    if (filmToken) setViewerInviteToken(filmToken)
  }, [viewerTokenByFilmId])

  const loadViewerDashboard = useCallback(async () => {
    if (profile?.role !== 'viewer') return
    if (!profile.id && !profile.isClaimant) return
    const uid = profile.id
    const email = (profile.email || '').trim()

    // Sent and received invites depend only on the identity — fetch together.
    // Claimants (fix 2026-07-19): their sends are found by sender_id = the
    // claim's silent account (claimed_by — Piece E stamps it on every
    // generation; the old sender_email + sender_id IS NULL query matched
    // nothing for account-backed claimants and showed '0 given'). Legacy
    // accountless claims (claimed_by NULL) keep the NULL-sender email match —
    // for them it is still the truth. Their one "received" film IS their
    // claimed invite — the claimed row has recipient_email NULL, so the email
    // lookup can't find it.
    const senderId = uid || profile.claimedBy || null
    const [{ data: sent, error: sentErr }, { data: allRecvd }] = await Promise.all([
      senderId
        ? supabase
            .from('invites')
            .select('*')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false })
        : supabase
            .from('invites')
            .select('*')
            .ilike('sender_email', email)
            .is('sender_id', null)
            .order('created_at', { ascending: false }),
      profile.isClaimant
        ? Promise.resolve({
            data: [
              {
                film_id: profile.claimedFilmId,
                token: profile.claimedInviteToken,
                status: profile.claimedStatus,
              },
            ],
          })
        : email
          ? supabase
              .from('invites')
              .select('film_id, token, status, link_slug, claimed_by, ticket_no')
              // Silent accounts (Piece E): claim-link rows keep recipient_email
              // NULL — an account holder's claimed films are found by
              // claimed_by (primary; exact) or claimed_email (attach-failed /
              // pre-backfill fallback).
              .or(
                uid
                  ? `recipient_email.ilike.${email},claimed_by.eq.${uid},claimed_email.ilike.${email}`
                  : `recipient_email.ilike.${email},claimed_email.ilike.${email}`
              )
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: null }),
    ])

    if (sentErr) console.error(sentErr)
    const sentList = sent || []
    setAllViewerSentInvites(sentList)

    let filmId = sentList[0]?.film_id
    const tokenByFilmId = {}
    /** creator_id for the selected film when the received-films query already has it —
     *  lets the creator-name lookup run in the same round trip as the film + invites. */
    let knownCreatorId = null

    // Fetch ALL films the viewer has been invited to watch
    if (email) {
      if (allRecvd?.length) {
        // De-duplicate by film_id, preserving most-recent-first order
        const seen = new Set()
        const uniqueRecvd = allRecvd.filter(r => {
          if (seen.has(r.film_id)) return false
          seen.add(r.film_id)
          return true
        })

        // Resolve film details for every received film
        const { data: filmRows } = await supabase
          .from('films')
          .select('id, title, thumbnail_url, creator_id')
          .in('id', uniqueRecvd.map(r => r.film_id))

        const filmsMap = new Map((filmRows || []).map(f => [f.id, f]))
        const allFilms = uniqueRecvd
          .map(r => {
            if (r.token) tokenByFilmId[r.film_id] = r.token
            return {
              id: r.film_id,
              title: filmsMap.get(r.film_id)?.title || '',
              thumbnail_url: filmsMap.get(r.film_id)?.thumbnail_url || null,
              token: r.token,
              // Claim-flow invites route by slug (Piece E) — the card sends
              // them to /watch/{slug} instead of the legacy /i/{token}.
              linkSlug: r.link_slug || null,
              // Received-invite status — drives the screening card's
              // Resume film / Watch again state (screeningCard.js).
              status: r.status || null,
              // The viewer's own "Ticket No." for this film (the number on
              // the invite they received). Null pre-backfill.
              ticketNo: r.ticket_no ?? null,
            }
          })
          .filter(f => f.id)
        setViewerAllFilms(allFilms)
        setViewerTokenByFilmId(tokenByFilmId)

        // Primary film = most recent received
        if (!filmId) filmId = uniqueRecvd[0]?.film_id
        knownCreatorId = filmsMap.get(filmId)?.creator_id || null

        setViewerInviteToken(
          tokenByFilmId[filmId] || uniqueRecvd[0]?.token || safeLocalStorage.getItem('viewer_invite_token') || null
        )
      }
    }

    if (!filmId) {
      setViewerAllFilms([])
      setViewerTokenByFilmId({})
      await selectViewerFilm(null)
      return
    }

    setViewerFilmId(filmId)
    safeSessionStorage.setItem('dash_viewer_film_id', filmId)

    // Selected film's row, its invites, and (when the creator is already known
    // from the received-films query) the creator's name are independent — fetch
    // together. maybeSingle on the name: viewers can't read the creator's profile
    // under RLS — zero rows is expected, not an error.
    const [{ data: filmRow }, { data: allInv }, knownCreatorRes] = await Promise.all([
      supabase
        .from('films')
        .select('id, title, thumbnail_url, creator_id')
        .eq('id', filmId)
        .single(),
      supabase.from('invites').select('*').eq('film_id', filmId),
      knownCreatorId
        ? supabase.from('users').select('name').eq('id', knownCreatorId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    setViewerFilmTitle(filmRow?.title || '')
    setViewerFilmInvites(allInv || [])
    setViewerFilmCreatorId(filmRow?.creator_id || null)

    let cname = knownCreatorRes?.data?.name || ''
    if (!cname && filmRow?.creator_id && filmRow.creator_id !== knownCreatorId) {
      // Rare path: the film row revealed a creator we didn't already know about.
      const { data: cr } = await supabase
        .from('users')
        .select('name')
        .eq('id', filmRow.creator_id)
        .maybeSingle()
      cname = cr?.name || ''
    }
    setViewerCreatorName(cname)

    return sentList[0]?.id ?? null
  }, [profile?.id, profile?.role, profile?.email, profile?.isClaimant, profile?.claimedBy, profile?.claimedFilmId, profile?.claimedInviteToken, selectViewerFilm])

  useEffect(() => {
    if (profile) loadDashboard()
  }, [profile])

  useEffect(() => {
    if (!isTeamMember || !profile?.team_creator_id) {
      setLeadCreatorName('')
      return
    }
    let cancelled = false
    supabase
      .from('users')
      .select('name')
      .eq('id', profile.team_creator_id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setLeadCreatorName(data?.name || '')
      })
    return () => {
      cancelled = true
    }
  }, [isTeamMember, profile?.team_creator_id])

  async function loadTeamSection() {
    if (profile?.role !== 'creator') return
    const { data: pending } = await supabase
      .from('team_invites')
      .select('id, email, invited_name, expires_at, created_at')
      .eq('creator_id', profile.id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false })

    const { data: members } = await supabase
      .from('users')
      .select('id, name, email, created_at')
      .eq('team_creator_id', profile.id)
      .order('created_at', { ascending: false })

    setTeamInvites(pending || [])
    setTeamMembers(members || [])
  }

  useEffect(() => {
    if (profile?.role === 'creator') void loadTeamSection()
  }, [profile?.id, profile?.role])

  /** Ticket-status fetch (Piece B, per-film since Piece F): ONE batched call
   *  PER FILM — each film's table shows that film's true balances. Deduped by
   *  content so a reload with the same people never refetches. The server is
   *  the gate (ADMIN_USER_ID pin) — a 403/503 simply leaves the map empty
   *  and no controls render. Read-only; the popover's actions do the writing. */
  const lastTicketFetchKey = useRef('')
  useEffect(() => {
    if (profile?.role !== 'creator') return
    const idsByFilm = new Map()
    for (const filmId of Object.keys(filmInvitesRaw)) {
      const ids = new Set()
      for (const row of buildNetworkPeople({
        filmInvites: filmInvitesRaw[filmId] || [],
        users: filmSenderUsers,
        creatorId: profile.id,
      })) {
        if (row.kind === 'person' && row.userId) ids.add(row.userId)
      }
      if (ids.size) idsByFilm.set(filmId, [...ids].sort())
    }
    if (!idsByFilm.size) return
    const fetchKey = [...idsByFilm.entries()]
      .map(([f, ids]) => `${f}:${ids.join(',')}`)
      .sort()
      .join('|')
    if (fetchKey === lastTicketFetchKey.current) return
    lastTicketFetchKey.current = fetchKey
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const results = await Promise.all(
          [...idsByFilm.entries()].map(async ([filmId, ids]) => {
            const { statuses } = await api.adminTicketStatuses(filmId, ids, session.access_token)
            return [filmId, statuses || {}]
          })
        )
        // Apply only while this set is still current — a reload with the
        // SAME people may cancel-and-skip (the dedupe), so the in-flight
        // result must land; a different set bumps the key and this stale
        // result is dropped.
        if (lastTicketFetchKey.current === fetchKey) {
          setTicketStatuses(Object.fromEntries(results))
        }
      } catch {
        /* not the owner account (or not configured) — no controls shown */
      }
    })()
  }, [profile?.id, profile?.role, filmInvitesRaw, filmSenderUsers])

  /** One server call per committed popover action; fresh per-film state comes
   *  back and updates both the cell and the Tickets-left column live. Returns
   *  whether the action applied (the popover keeps pending state on failure). */
  async function handleTicketControl(filmId, userId, payload) {
    setControlsBusy(true)
    setControlsError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const result = await api.adminTicketControl(
        { userId, filmId, ...payload },
        session?.access_token
      )
      if (result?.applied) {
        setTicketStatuses((prev) => ({
          ...prev,
          [filmId]: { ...prev[filmId], [userId]: { ...prev[filmId]?.[userId], ...result } },
        }))
        return true
      }
      setControlsError(result?.reason || 'Could not update')
      return false
    } catch (err) {
      setControlsError(err.message || 'Could not update')
      return false
    } finally {
      setControlsBusy(false)
    }
  }

  async function loadDashboard() {
    try {
      if (profile.role === 'viewer') {
        await loadViewerDashboard()
        setFilms([])
        setFilmStats({})
        setFilmSenderUsers([])
        return
      }

      if (isTeamMember && !filmOwnerId) {
        setFilms([])
        setFilmStats({})
        setFilmSenderUsers([])
        return
      }

      const ownerId = filmOwnerId || profile.id

      const { data: creatorFilms } = await supabase
        .from('films')
        .select('*')
        .eq('creator_id', ownerId)
        .order('created_at', { ascending: false })

      setFilms(creatorFilms || [])

      const stats = {}
      const rawInvites = {}

      // One query for every film's invites and one for every sender's profile, instead of a
      // query per film plus a query per invite — those ran sequentially from the browser, so a
      // dashboard with N invites paid N cross-region round trips before it could render.
      const filmIds = (creatorFilms || []).map((f) => f.id)
      const { data: allFilmInvites } = filmIds.length
        ? await supabase
            .from('invites')
            .select('*')
            .in('film_id', filmIds)
            .order('created_at', { ascending: true })
        : { data: [] }

      // One users query resolves names AND (Piece E) the unified wallet for
      // the admin table: senders plus silent-account claimants (claimed_by).
      const senderIds = [
        ...new Set(
          (allFilmInvites || [])
            .flatMap((i) => [i.sender_id, i.claimed_by])
            .filter(Boolean)
        ),
      ]
      let senderRows = []
      if (senderIds.length) {
        // RLS reality (verified 2026-07-17): users SELECT policies are
        // row-level — the creator reads only their own row and team members'
        // rows; everyone else's rows are silently filtered out, wallet
        // columns and all. So tickets-left resolves for team members and
        // stays the em dash for other account holders (kept by decision —
        // no client workaround). The error fallback below only guards a
        // hypothetical column-privilege config.
        const wide = await supabase
          .from('users')
          .select('id, name, email, role, team_creator_id, unlimited_shares, invite_allocation')
          .in('id', senderIds)
        if (wide.error) {
          console.warn('users wallet columns unreadable — narrow select fallback:', wide.error.message)
          ;({ data: senderRows } = await supabase.from('users').select('id, name, email').in('id', senderIds))
        } else {
          senderRows = wide.data
        }
        senderRows = senderRows || []
      }
      for (const film of creatorFilms || []) {
        const all = (allFilmInvites || []).filter((i) => i.film_id === film.id)
        rawInvites[film.id] = all
        stats[film.id] = computeTicketFunnel(all)
      }

      setFilmStats(stats)
      setFilmInvitesRaw(rawInvites)
      setFilmSenderUsers(senderRows || [])
    } finally {
      setLoading(false)
    }
  }


  /* ── Identity gate. RULE (2026-07-16): no identity state may ever render a
     blank page. The old `return null` here relied on ProtectedRoute
     guaranteeing a profile — but profileLoaded stays FALSE forever for
     visitors with no session (auth.jsx resets it on signed-out state), so a
     claimant or stray visitor rendered nothing at all. Three explicit
     states instead: still-resolving → spinner; claimant stash whose invite
     can't be found (or any other unidentified arrival) → a graceful
     visitor screen; identified → the dashboard. ── */
  if (!profile) {
    const stillResolving = claimStash ? !claimantLookupDone : !profileLoaded
    if (stillResolving) {
      return (
        <div className="min-h-dvh flex items-center justify-center bg-bg-page">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
        </div>
      )
    }
    /* Founder-approved verbatim (2026-07-16). Do not edit. */
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-bg-page px-6 text-center text-warm">
        <DeepcastLogo variant="wordmark" size="text-4xl" className="text-warm opacity-90" />
        <p className="mt-10 font-serif-v3 text-xl">This page belongs to invited viewers.</p>
        <p className="mt-3 max-w-sm font-serif-v3 text-sm italic text-warm/60">
          If someone passed you a film, open the link they sent — it&apos;s your way in.
        </p>
        <Link
          to="/login"
          className="mt-8 font-sans text-[10px] uppercase tracking-[0.22em] text-warm/40 transition-colors hover:text-warm/70"
        >
          Sign in →
        </Link>
      </div>
    )
  }

  const statusBadge = {
    processing: 'bg-accent/20 text-accent',
    ready: 'bg-success/20 text-success',
  }

  const openShareModal = () => setIsShareModalOpen(true)

  /** After a link is generated in the share modal: refresh the sent list /
   *  graph, and a claimant's server-computed balance. */
  const handleLinkCreated = async () => {
    if (isClaimant) setClaimantBalanceVersion((v) => v + 1)
    await loadViewerDashboard()
  }

  /**
   * Edit name (passwordless platform — replaces the old change-password link).
   * Propagates everywhere the name appears: the profile (future share emails use
   * profile.name for the sender display + subject), invites this user sent
   * (sender labels), and invites addressed to them (their node label in every
   * network graph).
   */
  const handleSaveName = async () => {
    const newName = nameDraft.trim()
    if (!newName) {
      setNameError('First name cannot be empty.')
      return
    }
    if (newName.length > 50) {
      setNameError('Please keep your name under 50 characters.')
      return
    }
    setNameBusy(true)
    setNameError('')
    try {
      const { error } = await supabase
        .from('users')
        .update({ name: newName, first_name: newName })
        .eq('id', profile.id)
      if (error) throw error

      const email = (profile.email || '').trim()
      await Promise.all([
        supabase.from('invites').update({ sender_name: newName }).eq('sender_id', profile.id),
        email
          ? supabase.from('invites').update({ recipient_name: newName }).ilike('recipient_email', email)
          : Promise.resolve(),
      ])

      await fetchProfile(profile.id)
      if (isViewer) await loadViewerDashboard()
      setEditingName(false)
    } catch (e) {
      setNameError(e.message || 'Could not update your name.')
    } finally {
      setNameBusy(false)
    }
  }

  const creatorTotalTickets = Object.values(filmStats).reduce((a, s) => a + (s.generated || 0), 0)

  /* ===================== VIEWER V5 (design-refs/deepcast-dashboard-v5.html) ===================== */
  if (isViewer) {
    return (
      <>
        <ViewerDashboardV5
          profile={profile}
          isClaimant={isClaimant}
          loading={loading}
          inviteSentConfirmation={inviteSentConfirmation}
          films={viewerAllFilms}
          selectedFilmId={viewerFilmId}
          claimStashSlug={claimStash?.slug || null}
          ticketNo={
            isClaimant
              ? profile.claimedTicketNo
              : viewerAllFilms.find((f) => f.id === viewerFilmId)?.ticketNo ?? null
          }
          sentInvites={viewerSentInvites}
          filmInvites={viewerFilmInvites}
          creatorId={viewerFilmCreatorId}
          creatorName={viewerCreatorName}
          viewerInviteId={viewerFocusInviteId}
          ticketsRemaining={invitesLeft}
          ticketsGiven={sentCount}
          canShare={canShareMore}
          shareDisabled={shareDisabled}
          onShare={openShareModal}
          nameEditor={{
            editing: editingName,
            draft: nameDraft,
            setDraft: setNameDraft,
            busy: nameBusy,
            error: nameError,
            start: () => {
              setNameDraft(profile.name || '')
              setNameError('')
              setEditingName(true)
            },
            cancel: () => setEditingName(false),
            save: handleSaveName,
          }}
          onSignOut={() => signOut()}
        />
        <ShareLinkModal
          open={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          filmId={viewerFilmId}
          isClaimant={isClaimant}
          claimedInviteId={profile.claimedInviteId || null}
          parentInviteId={viewerFocusInviteId || null}
          onCreated={handleLinkCreated}
        />
      </>
    )
  }

  /* ===================== CREATOR / TEAM V3 DIPTYCH ===================== */
  return (
    <div className="relative z-10 flex min-h-dvh w-full flex-col overflow-hidden bg-bg-page text-warm lg:flex-row">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-faint/30 bg-ink/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] lg:hidden">
        <Link to="/" className="inline-block opacity-90 hover:opacity-100">
          <DeepcastLogo variant="wordmark" className="h-5 w-auto text-warm" />
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center text-warm/70"
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      <aside className={`${sidebarOpen ? 'flex' : 'hidden'} lg:flex w-full shrink-0 flex-col gap-6 overflow-y-auto border-b border-faint/30 bg-ink/80 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-6 sm:px-6 sm:py-10 panel-scroll lg:w-[22%] lg:min-h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-10`}>
        <div className="animate-fade-in">
          <Link to="/" className="hidden opacity-90 hover:opacity-100 lg:inline-block">
            <DeepcastLogo variant="wordmark" className="h-7 w-auto text-warm" />
          </Link>
          <h2 className="font-serif-v3 mt-4 text-xl text-warm">{profile.name}</h2>
          {isTeamMember && leadCreatorName && (
            <p className="mt-1 font-sans text-xs text-warm/50">For {leadCreatorName}&rsquo;s films</p>
          )}
        </div>
        <div className="hidden h-[0.5px] w-full bg-accent/20 lg:block" />
        {/* Stats hidden on mobile — the main page's strip already shows them. */}
        <div className="hidden flex-col gap-5 font-sans text-[9px] uppercase tracking-widest text-accent/80 lg:flex">
          <div>
            <span className="block text-warm/50">Films</span>
            <span className="font-display text-2xl font-light text-warm">{films.length}</span>
          </div>
          <div>
            <span className="block text-warm/50">Tickets generated (all films)</span>
            <span className="font-display text-2xl font-light text-warm">{creatorTotalTickets}</span>
          </div>
          {(profile.role === 'creator' || isTeamMember) && (
            <p className="normal-case text-warm/45">Unlimited tickets</p>
          )}
        </div>
        <div className="hidden h-[0.5px] w-full bg-accent/20 lg:block" />
        <nav className="flex flex-col gap-3 font-sans text-[10px] uppercase tracking-widest">
          <Link className="text-warm/40 transition-colors hover:text-warm" to="/profile">
            Profile
          </Link>
          <Link className="text-warm/40 transition-colors hover:text-warm" to="/profile#set-password">
            Set password
          </Link>
          <Link className="text-warm/40 transition-colors hover:text-warm" to="/network">
            Network map
          </Link>
          {profile.role === 'creator' && (
            <Link className="text-accent transition-colors hover:text-accent-hover" to="/upload">
              Upload film
            </Link>
          )}
          <Link className="text-warm/40 transition-colors hover:text-warm" to="/about">
            About
          </Link>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-left text-warm/40 transition-colors hover:text-warm"
          >
            Sign out
          </button>
        </nav>
      </aside>

      <main className="flex w-full min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-8 sm:px-6 sm:py-10 panel-scroll lg:w-[78%] lg:px-10 lg:py-12">
        {/* Mobile-only stats strip (lg:hidden — desktop keeps the always-visible
            sidebar untouched): the same totals as the sidebar, same values and
            styling, visible immediately without opening the hamburger. */}
        <div
          aria-label="Your stats"
          className="mb-8 flex flex-wrap items-start gap-x-10 gap-y-5 font-sans text-[9px] uppercase tracking-widest text-accent/80 animate-fade-in lg:hidden"
        >
          <div>
            <span className="block text-warm/50">Films</span>
            <span className="font-display text-2xl font-light text-warm">{films.length}</span>
          </div>
          <div>
            <span className="block text-warm/50">Tickets generated (all films)</span>
            <span className="font-display text-2xl font-light text-warm">{creatorTotalTickets}</span>
          </div>
          {(profile.role === 'creator' || isTeamMember) && (
            <p className="self-end normal-case text-warm/45">Unlimited tickets</p>
          )}
        </div>
        {profile.role === 'creator' && (
          <section className="mb-10 animate-fade-in border border-border bg-bg-card p-6">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">
              Team members
            </h2>
            <p className="mb-4 max-w-xl text-sm text-text-muted">
              Enter their email. If they don&apos;t have an account yet, we email a registration link.
              If they already have a <strong>viewer</strong> account, we upgrade them to teammate,
              grant unlimited invites for your films, and email them a short sign-in reminder.
            </p>
            <div className="mb-4 flex flex-col gap-3">
              <input
                type="email"
                placeholder="Teammate email"
                value={teamEmail}
                onChange={(e) => setTeamEmail(e.target.value)}
                className="w-full rounded-none border border-border bg-bg-page px-3 py-2.5 text-sm text-text sm:py-2"
              />
              <input
                type="text"
                placeholder="Name (optional, for new invites only)"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full rounded-none border border-border bg-bg-page px-3 py-2.5 text-sm text-text sm:py-2"
              />
              <button
                type="button"
                disabled={teamBusy}
                onClick={async () => {
                  setTeamMessage('')
                  if (!teamEmail.trim().includes('@')) {
                    setTeamMessage('Enter a valid email.')
                    return
                  }
                  setTeamBusy(true)
                  try {
                    const r = await api.sendTeamInvite(
                      profile.id,
                      teamEmail.trim(),
                      teamName.trim(),
                      window?.location?.origin || null
                    )
                    setTeamMessage(
                      r?.upgradedFromViewer
                        ? 'Existing viewer added—we sent them a sign-in email.'
                        : 'Invitation email sent.'
                    )
                    setTeamEmail('')
                    setTeamName('')
                    await loadTeamSection()
                  } catch (e) {
                    setTeamMessage(e.message || 'Could not add teammate.')
                  } finally {
                    setTeamBusy(false)
                  }
                }}
                className="shrink-0 cursor-pointer rounded-none bg-accent px-4 py-2 text-xs uppercase tracking-wider text-warm transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {teamBusy ? 'Working…' : 'Add teammate'}
              </button>
            </div>
            {teamMessage && <p className="mb-4 text-sm text-text-muted">{teamMessage}</p>}
            {teamInvites.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">Pending invites</p>
                <ul className="space-y-1 text-sm text-text-muted">
                  {teamInvites.map((t) => (
                    <li key={t.id}>
                      {t.email}
                      {t.invited_name ? ` · ${t.invited_name}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {teamMembers.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-text-muted">On your team</p>
                <ul className="space-y-2 text-sm text-text">
                  {teamMembers.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-b-0"
                    >
                      <span>
                        {m.name}{' '}
                        <span className="text-text-muted">({m.email})</span>
                      </span>
                      <button
                        type="button"
                        disabled={teamRemoveBusyId === m.id}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Remove ${m.name || m.email} from your team? They keep their login as a viewer but lose access to your films and team tools until invited again.`
                            )
                          ) {
                            return
                          }
                          setTeamMessage('')
                          setTeamRemoveBusyId(m.id)
                          try {
                            const memberId = m.id
                            const { data: { session } } = await supabase.auth.getSession()
                            await api.removeTeamMember(memberId, session?.access_token)
                            setTeamMembers((prev) =>
                              prev.filter((x) => String(x.id) !== String(memberId))
                            )
                            await loadTeamSection()
                            setTeamMessage('Teammate removed.')
                          } catch (e) {
                            setTeamMessage(e.message || 'Could not remove teammate.')
                          } finally {
                            setTeamRemoveBusyId(null)
                          }
                        }}
                        className="shrink-0 cursor-pointer text-xs uppercase tracking-wider text-error/90 transition-colors hover:text-error disabled:opacity-50"
                      >
                        {teamRemoveBusyId === m.id ? 'Removing…' : 'Remove'}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : films.length === 0 ? (
          <div className="animate-fade-in py-20 text-center">
            <p className="mb-6 text-sm text-text-muted">
              {isTeamMember
                ? 'No films are available yet. Your filmmaker needs to upload a film first.'
                : 'No films uploaded yet.'}
            </p>
            {profile.role === 'creator' && (
              <Link
                to="/upload"
                className="text-sm text-accent transition-colors hover:text-accent-hover"
              >
                Upload your first film &rarr;
              </Link>
            )}
          </div>
        ) : (
          <div className="animate-fade-in space-y-8 animate-delay-200">
            {films.map((film) => {
              const stats = filmStats[film.id] || {}
              const isInviteOpen = inviteFilmId === film.id

              return (
                <div key={film.id} className="border border-border bg-bg-card p-6">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-4">
                      {film.thumbnail_url && (
                        <img
                          src={ensureHttpsUrl(film.thumbnail_url) ?? film.thumbnail_url}
                          alt={film.title}
                          className="h-14 w-24 rounded-none object-cover"
                        />
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-lg">{film.title}</h3>
                          {profile.role === 'creator' && (
                            <Link
                              to={`/upload?edit=${film.id}`}
                              className="text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
                            >
                              Edit
                            </Link>
                          )}
                        </div>
                        {film.description && (
                          <p className="mt-1 line-clamp-1 text-xs text-text-muted">
                            {film.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setInviteFilmId(isInviteOpen ? null : film.id)}
                        className="cursor-pointer text-xs uppercase tracking-wider text-accent transition-colors hover:text-accent-hover"
                      >
                        {isInviteOpen ? 'Close' : 'Create an invitation'}
                      </button>
                      <span
                        className={`rounded-none px-3 py-1 text-xs uppercase tracking-wider ${statusBadge[film.status]}`}
                      >
                        {film.status}
                      </span>
                    </div>
                  </div>

                  {isInviteOpen && (
                    <div className="mb-6">
                      <CreatorLinkPanel filmId={film.id} onCreated={() => loadDashboard()} />
                    </div>
                  )}

                  <div className="mb-6 grid grid-cols-3 gap-4">
                    {[
                      { label: 'Tickets generated', value: stats.generated || 0 },
                      { label: 'Claimed', value: stats.claimed || 0 },
                      { label: 'Watched', value: stats.watched || 0 },
                    ].map((stat) => (
                      <div key={stat.label} className="text-center">
                        <p className="text-xl font-light text-accent">{stat.value}</p>
                        <p className="mt-1 text-xs uppercase tracking-wider text-text-muted">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {isTeamMember && filmInvitesRaw[film.id]?.length > 0 && (() => {
                    const gl = buildGraphLayout({
                      filmInvites: filmInvitesRaw[film.id],
                      filmTitle: film.title,
                      creatorName: leadCreatorName,
                      creatorId: filmOwnerId,
                      teamMemberIds: [profile.id],
                      viewerRecipientKey: null,
                      focusInviteId: null,
                      viewerUserId: profile.id,
                    })
                    return gl ? (
                      <div className="mb-2 flex w-full flex-col">
                        <div className="mb-3 flex flex-row items-baseline justify-between gap-4">
                          <h3 className="font-sans text-[10px] font-medium uppercase tracking-[0.32em] text-warm/50">
                            Network impact
                          </h3>
                          <span className="font-serif-v3 text-[12px] italic text-warm/65">
                            {film.title}
                          </span>
                        </div>
                        <div className="relative flex h-[min(52vh,560px)] w-full overflow-hidden bg-[#121a33] sm:h-[min(56vh,620px)]">
                          <NetworkGraph
                            fillHeight
                            pannable
                            showZoomControls
                            transparentSurface
                            nodesData={gl.nodesData}
                            linksData={gl.linksData}
                            viewBoxH={gl.viewBoxH}
                            viewBoxW={gl.viewBoxW}
                            ringRadii={gl.ringRadii}
                            sectionLabels={gl.sectionLabels}
                            rootNode={gl.rootNode}
                            defaultActiveNodes={gl.defaultActiveNodes}
                            defaultActiveLinks={gl.defaultActiveLinks}
                          />
                        </div>
                      </div>
                    ) : null
                  })()}

                  {!isTeamMember && (() => {
                    /* One row per PERSON (account holders + accountless
                       claimants together) — src/lib/networkPeople.js is the
                       single computation behind every number here. Computed
                       from the already-loaded invite rows on each render;
                       fine at the current network size. */
                    const people = buildNetworkPeople({
                      filmInvites: filmInvitesRaw[film.id] || [],
                      users: filmSenderUsers,
                      creatorId: profile.id,
                    })
                    if (!people.length) return null
                    /* Exactly three display statuses (founder-approved A2). */
                    const stageLabel = {
                      watched: 'Watched',
                      claimed: 'Claimed',
                      unclaimed: 'Unclaimed',
                    }
                    const stageClass = {
                      watched: 'text-success',
                      claimed: 'text-accent',
                      unclaimed: '',
                    }
                    const teamMemberIdSet = new Set(teamMembers.map((m) => String(m.id)))
                    const dash = <span className="text-text-muted/50">&mdash;</span>
                    return (
                      <div>
                        <p className="mb-3 text-xs uppercase tracking-wider text-text-muted">
                          People in this network
                        </p>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[760px] text-left text-xs text-text-muted">
                            <thead>
                              <tr className="border-b border-border text-[10px] uppercase tracking-wider">
                                <th className="py-2 pr-4 font-medium">Name</th>
                                <th className="py-2 pr-4 font-medium">Email</th>
                                <th className="py-2 pr-4 font-medium">Status</th>
                                <th className="py-2 pr-4 font-medium">Tickets generated</th>
                                <th className="py-2 pr-4 font-medium">Claimed</th>
                                <th className="py-2 pr-4 font-medium">Tickets left</th>
                                <th className="py-2 pr-4 font-medium">Reach</th>
                                <th className="py-2 font-medium">Ticket controls</th>
                              </tr>
                            </thead>
                            <tbody>
                              {people.map((row) => {
                                /* Quiet delete-with-splice affordance (Piece C):
                                   muted until hover, opens the server-preview
                                   confirm surface. */
                                const removeAffordance = (key, target) => (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        setRemoveOpenFor((open) =>
                                          open?.key === key
                                            ? null
                                            : { key, rect, filmId: film.id, target }
                                        )
                                      }}
                                      className="ml-2 cursor-pointer text-[9px] uppercase tracking-wider text-text-muted/40 transition-colors hover:text-error"
                                    >
                                      Remove
                                    </button>
                                    {removeOpenFor?.key === key && (
                                      <RemovePersonPopover
                                        anchorRect={removeOpenFor.rect}
                                        filmId={removeOpenFor.filmId}
                                        target={removeOpenFor.target}
                                        onDeleted={() => {
                                          setRemoveOpenFor(null)
                                          loadDashboard()
                                        }}
                                        onClose={() => setRemoveOpenFor(null)}
                                      />
                                    )}
                                  </>
                                )
                                if (row.kind === 'ticket') {
                                  /* Outstanding link: recoverable from the table.
                                     Same copy interaction as the link panel. */
                                  const url = row.slug
                                    ? `${window.location.origin}/${row.slug}`
                                    : null
                                  return (
                                    <tr key={row.id} className="border-b border-border/60 last:border-b-0">
                                      <td className="py-2 pr-4 text-text">
                                        {row.name}
                                        {url && (
                                          <span className="mt-1 flex flex-wrap items-center gap-2">
                                            <span className="break-all text-[11px] text-text-muted">{url}</span>
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                try {
                                                  await navigator.clipboard.writeText(
                                                    `I watched this and thought of you — ${url}`
                                                  )
                                                  setCopiedTicketId(row.id)
                                                } catch {
                                                  setCopiedTicketId(null)
                                                }
                                              }}
                                              className="cursor-pointer rounded-none border border-border px-2 py-0.5 text-[9px] uppercase tracking-wider text-text-muted transition-colors hover:border-text-muted hover:text-text"
                                            >
                                              {copiedTicketId === row.id ? 'Copied' : 'Copy the message'}
                                            </button>
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 pr-4">{dash}</td>
                                      <td className="py-2 pr-4 uppercase tracking-wider">Unclaimed</td>
                                      <td className="py-2 pr-4">{dash}</td>
                                      <td className="py-2 pr-4">{dash}</td>
                                      <td className="py-2 pr-4">{dash}</td>
                                      <td className="py-2 pr-4">{dash}</td>
                                      <td className="py-2">
                                        {dash}
                                        {removeAffordance(`ticket-${row.id}`, {
                                          kind: 'ticket',
                                          inviteId: row.id,
                                          name: row.name,
                                        })}
                                      </td>
                                    </tr>
                                  )
                                }
                                const person = row
                                const email = person.email
                                const status = person.userId
                                  ? ticketStatuses[film.id]?.[person.userId]
                                  : null
                                return (
                                  <tr key={email} className="border-b border-border/60 last:border-b-0">
                                    <td className="py-2 pr-4 text-text">{person.name}</td>
                                    <td className="py-2 pr-4">{email}</td>
                                    <td
                                      className={`py-2 pr-4 uppercase tracking-wider ${stageClass[person.stage] || ''}`}
                                    >
                                      {stageLabel[person.stage] || person.stage}
                                    </td>
                                    <td className="py-2 pr-4">{person.ticketsGenerated}</td>
                                    <td className="py-2 pr-4">{person.ticketsClaimed}</td>
                                    <td className="py-2 pr-4">
                                      {status
                                        ? /* the batched admin fetch is the truth (Piece B) */
                                          status.unlimited
                                          ? '∞'
                                          : status.ticketsLeft ?? 0
                                        : person.ticketsLeft != null
                                          ? Number.isFinite(person.ticketsLeft)
                                            ? person.ticketsLeft
                                            : '∞'
                                          : teamMemberIdSet.has(String(person.userId ?? ''))
                                            ? '∞'
                                            : /* wallet not readable without the admin fetch */
                                              dash}
                                    </td>
                                    <td className="py-2 pr-4">{person.reach}</td>
                                    <td className="py-2">
                                      {(() => {
                                        /* Ticket controls (Piece B): state as text, click
                                           opens the popover. Only the owner ever has
                                           statuses (server-pinned); everyone else sees
                                           quiet state. */
                                        if (!person.userId) {
                                          return (
                                            <span className="text-[10px] uppercase tracking-wider text-text-muted/50">
                                              No account yet
                                            </span>
                                          )
                                        }
                                        if (!status) {
                                          return <span className="text-text-muted/50">&mdash;</span>
                                        }
                                        const first =
                                          (person.name || '').trim().split(/\s+/)[0] ||
                                          email.split('@')[0]
                                        return (
                                          <>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                // Read the anchor NOW — currentTarget is
                                                // null by the time the updater runs.
                                                const rect = e.currentTarget.getBoundingClientRect()
                                                setControlsError('')
                                                setControlsOpenFor((open) =>
                                                  open?.userId === person.userId
                                                    ? null
                                                    : { userId: person.userId, rect }
                                                )
                                              }}
                                              className="cursor-pointer rounded-full border border-border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-text-muted hover:text-text"
                                            >
                                              {status.unlimited ? '∞' : `${status.ticketsLeft ?? 0} left`}
                                            </button>
                                            {controlsOpenFor?.userId === person.userId && (
                                              <TicketControlsPopover
                                                anchorRect={controlsOpenFor.rect}
                                                firstName={first}
                                                status={status}
                                                busy={controlsBusy}
                                                error={controlsError}
                                                onGrant={(amount) =>
                                                  handleTicketControl(film.id, person.userId, {
                                                    action: 'grant',
                                                    amount,
                                                  })
                                                }
                                                onSetUnlimited={(unlimited) =>
                                                  handleTicketControl(film.id, person.userId, {
                                                    action: 'set_unlimited',
                                                    unlimited,
                                                  })
                                                }
                                                onClose={() => setControlsOpenFor(null)}
                                              />
                                            )}
                                          </>
                                        )
                                      })()}
                                      {removeAffordance(`person-${email}`, {
                                        kind: 'person',
                                        email,
                                        name: person.name,
                                      })}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}
        <MvpVersionLabel className="mt-14 self-center pb-2 text-center" />
      </main>
    </div>
  )
}
