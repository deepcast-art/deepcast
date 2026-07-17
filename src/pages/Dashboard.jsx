import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import InviteForm from '../components/InviteForm'
import DeepcastLogo from '../components/DeepcastLogo'
import MvpVersionLabel from '../components/MvpVersionLabel'
import NetworkGraph from '../components/NetworkGraph'
import { buildGraphLayout, resolveViewerFocus } from '../lib/graphLayout'
import { api } from '../lib/api'
import { ensureHttpsUrl } from '../lib/httpsUrl.js'
// Canonical reach stat — every reach count on every surface comes from here.
import {
  isInviteOpened as isOpened,
  buildChildrenByParentId,
  reachBelowInvite,
  computeUserReach,
} from '../lib/reach.js'
// Canonical share quota + per-film stats — same single-source rule as reach.
import { invitationsRemaining } from '../lib/shares.js'
import { computeFilmStats } from '../lib/filmStats.js'
import { safeLocalStorage, safeSessionStorage } from '../lib/safeStorage.js'
import { readClaimStash } from '../lib/claimStash.js'
import { screeningCardState } from '../lib/screeningCard.js'
import { INITIAL_CLAIMANT_TICKETS } from '../lib/ticketRules.js'
import { formatOrdinal } from '../lib/ordinal.js'

/** Sent-invitations list renders in pages so an unlimited sharer with hundreds of
 *  shares can see them ALL without slowing the dashboard down. Normal users never
 *  exceed one page, so their behavior is unchanged. */
const SENT_LIST_PAGE_SIZE = 25

function formatNamesList(names) {
  const filtered = names.filter(Boolean)
  if (filtered.length === 0) return ''
  if (filtered.length === 1) return filtered[0]
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`
  return `${filtered.slice(0, -1).join(', ')}, and ${filtered[filtered.length - 1]}`
}

/** "People you've reached" label with its explainer. Hover opens it on desktop;
 *  on touch screens (no hover) tapping the ? toggles it and tapping anywhere
 *  else closes it. `tipBelow` flips the bubble under the label for spots where
 *  above would clip (the mobile stats strip sits at the top of the scroll area). */
function ReachExplainer({ tipBelow = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <span
      ref={ref}
      className="group relative inline-flex w-fit cursor-help font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-warm/45"
    >
      People you&apos;ve reached
      <button
        type="button"
        aria-label="What does this number mean?"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`ml-1.5 inline-flex h-3.5 w-3.5 shrink-0 cursor-help touch-manipulation items-center justify-center self-start rounded-full border text-[8px] font-medium leading-none tracking-normal transition-colors duration-200 group-hover:border-warm/60 group-hover:text-warm/75 ${
          open ? 'border-warm/60 text-warm/75' : 'border-warm/30 text-warm/45'
        }`}
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-0 z-20 w-60 border border-faint/40 bg-[#05070a] px-3 py-2 text-sm font-normal normal-case leading-relaxed tracking-normal text-warm/80 shadow-lg transition-opacity duration-200 group-hover:opacity-100 ${
          tipBelow ? 'top-full mt-2' : 'bottom-full mb-2'
        } ${open ? 'opacity-100' : 'opacity-0'}`}
      >
        Everyone who&apos;s opened an invite because of you — the people you shared with, plus everyone they passed it on to.
      </span>
    </span>
  )
}

export default function Dashboard() {
  const { profile: authProfile, signOut, fetchProfile, profileLoaded } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

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
      tickets_remaining: claimantInvite.tickets_remaining ?? null,
      claimedFilmId: claimantInvite.film_id,
      claimedStatus: claimantInvite.status || null,
      claimedSlug: claimStash.slug,
    }
  }, [authProfile, claimStash, claimantInvite])
  const isClaimant = Boolean(profile?.isClaimant)
  const inviteSentConfirmation = location.state?.inviteSent
    ? location.state.recipientName || 'your invitee'
    : null
  const [films, setFilms] = useState([])
  const [filmStats, setFilmStats] = useState({})
  const [inviteTree, setInviteTree] = useState({})
  const [loading, setLoading] = useState(() => !profileLoaded || Boolean(readClaimStash()))
  const [inviteFilmId, setInviteFilmId] = useState(null)
  const [inviteSentByFilm, setInviteSentByFilm] = useState({})
  const inviteSentTimeouts = useRef({})
  const [resendStatusByFilm, setResendStatusByFilm] = useState({})
  const resendStatusTimeouts = useRef({})
  const [resendStatusByInvite, setResendStatusByInvite] = useState({})
  const resendInviteTimeouts = useRef({})
  const [filmInvitesRaw, setFilmInvitesRaw] = useState({})

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
   *  navigation only). Desktop sidebars are always visible and unaffected. */
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [viewerSidebarOpen, setViewerSidebarOpen] = useState(false)

  const [newestInviteId, setNewestInviteId] = useState(null)
  const [allViewerSentInvites, setAllViewerSentInvites] = useState([])
  const [viewerFilmId, setViewerFilmId] = useState(
    () => safeSessionStorage.getItem('dash_viewer_film_id') || null
  )
  const [viewerFilmTitle, setViewerFilmTitle] = useState('')
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

  // parent_invite_id -> child invites, across the film's entire invite tree.
  const childrenByParentId = useMemo(
    () => buildChildrenByParentId(viewerFilmInvites),
    [viewerFilmInvites]
  )

  // "People you've reached": the canonical reach stat (src/lib/reach.js) —
  // everyone in the viewer's downstream branch whose invite is OPENED.
  const viewerReachedCount = useMemo(
    () => computeUserReach(viewerSentInvites, childrenByParentId),
    [viewerSentInvites, childrenByParentId]
  )

  // Per direct invitee: how many people THEY have reached (their opened
  // descendants, not counting themselves). Same canonical computation.
  const reachByInvite = useMemo(() => {
    const counts = {}
    for (const inv of viewerSentInvites) counts[inv.id] = reachBelowInvite(childrenByParentId, inv.id)
    return counts
  }, [viewerSentInvites, childrenByParentId])

  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [modalFirst, setModalFirst] = useState('')
  const [modalLast, setModalLast] = useState('')
  const [modalEmail, setModalEmail] = useState('')
  const [modalNote, setModalNote] = useState('')
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState('')

  const [visibleSentCount, setVisibleSentCount] = useState(SENT_LIST_PAGE_SIZE)
  /** Owner-only unlimited-shares toggle: per-email status from the admin endpoint
   *  ({ invitedByYou, hasAccount, eligible, unlimited }). Stays empty for anyone
   *  the server rejects (the endpoint is pinned to ADMIN_USER_ID server-side),
   *  so no toggles render for non-owner accounts. */
  const [unlimitedStatuses, setUnlimitedStatuses] = useState({})
  const [unlimitedBusy, setUnlimitedBusy] = useState({})
  const [unlimitedError, setUnlimitedError] = useState({})
  /** Per-email inline confirm (the pill never flips without one). */
  const [unlimitedConfirm, setUnlimitedConfirm] = useState({})
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState('')

  const isTeamMember = profile?.role === 'team_member'
  const filmOwnerId =
    profile?.role === 'team_member' ? profile?.team_creator_id : profile?.id
  const isViewer = profile?.role === 'viewer'

  /** Canonical quota, surfaced as TICKETS (2026-07-16). Claimants spend from
   *  their claimed invite's tickets_remaining (NULL = claimed pre-migration →
   *  full grant, healed server-side on first spend); accounts keep the
   *  invitationsRemaining machinery (src/lib/shares.js) unchanged. */
  const invitesLeft = !isViewer
    ? null
    : isClaimant
      ? profile.tickets_remaining ?? INITIAL_CLAIMANT_TICKETS
      : invitationsRemaining(profile)
  const sentCount = isViewer ? viewerSentInvites.length : 0
  // The dashboard's email share modal is an account-flow surface — claimants
  // share from the watch page's panel instead (flagged, per the final spec).
  const canShareMore = isViewer && viewerFilmId && !isClaimant
  const shareDisabled = isViewer && !isClaimant && invitationsRemaining(profile) <= 0

  // Shared focus resolution (same helper every graph surface uses): email match first,
  // then invite-token match, then the common parent of the viewer's sent invites.
  const { viewerRecipientKey, focusInviteId: viewerFocusInviteId } = useMemo(
    () =>
      resolveViewerFocus(viewerFilmInvites, profile?.email, {
        // Claimants: their claimed invite's token is the reliable focus key —
        // the claimed row has no recipient_email for the email match to find.
        inviteToken: profile?.claimedInviteToken || viewerInviteToken,
        viewerUserId: profile?.id,
      }),
    [viewerFilmInvites, profile?.email, profile?.claimedInviteToken, viewerInviteToken, profile?.id]
  )

  const graphLayout = useMemo(() => {
    if (!viewerFilmInvites?.length) return null
    return buildGraphLayout({
      filmInvites: viewerFilmInvites,
      filmTitle: viewerFilmTitle || 'Film',
      creatorName: viewerCreatorName,
      creatorId: viewerFilmCreatorId,
      viewerRecipientKey,
      focusInviteId: viewerFocusInviteId,
    })
  }, [viewerFilmInvites, viewerFilmTitle, viewerCreatorName, viewerFilmCreatorId, viewerRecipientKey, viewerFocusInviteId])

  const formattedRecipientNames = useMemo(() => {
    const names = viewerSentInvites.map(
      (inv) => inv.recipient_name?.trim() || inv.recipient_email?.split('@')[0] || 'Friend'
    )
    return formatNamesList(names)
  }, [viewerSentInvites])

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
    // Claimants: their sent links carry sender_email = claimed email (and no
    // sender_id); their one "received" film IS their claimed invite — the
    // claimed row has recipient_email NULL, so the email lookup can't find it.
    const [{ data: sent, error: sentErr }, { data: allRecvd }] = await Promise.all([
      uid
        ? supabase
            .from('invites')
            .select('*')
            .eq('sender_id', uid)
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
              .select('film_id, token, status')
              .ilike('recipient_email', email)
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
              // Received-invite status — drives the screening card's
              // Resume film / Watch again state (screeningCard.js).
              status: r.status || null,
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
  }, [profile?.id, profile?.role, profile?.email, profile?.isClaimant, profile?.claimedFilmId, profile?.claimedInviteToken, selectViewerFilm])

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

  /** Load unlimited-shares statuses for the people the creator invited. The server
   *  is the gate (ADMIN_USER_ID pin) — a 403/503 here simply leaves the map empty
   *  and no toggle UI renders. Read-only; never touches gating or quotas itself. */
  useEffect(() => {
    if (profile?.role !== 'creator') return
    const emails = [
      ...new Set(
        Object.values(inviteTree)
          .flat()
          .filter((n) => n.senderId === profile.id)
          .map((n) => (n.recipient || '').trim().toLowerCase())
          .filter(Boolean)
      ),
    ]
    if (!emails.length) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const { statuses } = await api.adminUnlimitedSharesStatus(emails, session.access_token)
        if (!cancelled && statuses) setUnlimitedStatuses(statuses)
      } catch {
        /* not the owner account (or not configured) — no toggles shown */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profile?.id, profile?.role, inviteTree])

  async function handleToggleUnlimited(rawEmail) {
    const email = (rawEmail || '').trim().toLowerCase()
    const current = unlimitedStatuses[email]
    if (!current?.eligible || unlimitedBusy[email]) return
    setUnlimitedBusy((prev) => ({ ...prev, [email]: true }))
    setUnlimitedError((prev) => ({ ...prev, [email]: '' }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const result = await api.adminSetUnlimitedShares(email, !current.unlimited, session?.access_token)
      setUnlimitedStatuses((prev) => ({
        ...prev,
        [email]: { ...prev[email], unlimited: Boolean(result.unlimited) },
      }))
    } catch (err) {
      setUnlimitedError((prev) => ({ ...prev, [email]: err.message || 'Could not update' }))
    } finally {
      setUnlimitedBusy((prev) => ({ ...prev, [email]: false }))
    }
  }

  async function loadDashboard() {
    try {
      if (profile.role === 'viewer') {
        await loadViewerDashboard()
        setFilms([])
        setFilmStats({})
        setInviteTree({})
        return
      }

      if (isTeamMember && !filmOwnerId) {
        setFilms([])
        setFilmStats({})
        setInviteTree({})
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
      const trees = {}
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

      const senderIds = [...new Set((allFilmInvites || []).map((i) => i.sender_id).filter(Boolean))]
      const { data: senderRows } = senderIds.length
        ? await supabase.from('users').select('id, name, email').in('id', senderIds)
        : { data: [] }
      const senderById = new Map((senderRows || []).map((u) => [u.id, u]))

      for (const film of creatorFilms || []) {
        const all = (allFilmInvites || []).filter((i) => i.film_id === film.id)
        rawInvites[film.id] = all
        stats[film.id] = computeFilmStats(all)

        trees[film.id] = all.map((inv) => {
          const sender = inv.sender_id ? senderById.get(inv.sender_id) : null
          return {
            id: inv.id,
            sender: sender?.name || sender?.email || 'Anonymous',
            senderId: inv.sender_id,
            recipient: inv.recipient_email,
            recipientName: inv.recipient_name,
            status: inv.status,
          }
        })
      }

      setFilmStats(stats)
      setInviteTree(trees)
      setFilmInvitesRaw(rawInvites)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      Object.values(inviteSentTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId)
      })
      Object.values(resendStatusTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId)
      })
      Object.values(resendInviteTimeouts.current).forEach((timeoutId) => {
        clearTimeout(timeoutId)
      })
    }
  }, [])

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

  const handleResendLastInvite = async (filmId) => {
    setResendStatusByFilm((prev) => ({ ...prev, [filmId]: 'sending' }))
    try {
      await api.resendLastInvite(filmId, profile.id, window?.location?.origin || null)
      setResendStatusByFilm((prev) => ({ ...prev, [filmId]: 'sent' }))
      if (resendStatusTimeouts.current[filmId]) {
        clearTimeout(resendStatusTimeouts.current[filmId])
      }
      resendStatusTimeouts.current[filmId] = setTimeout(() => {
        setResendStatusByFilm((prev) => {
          if (!prev[filmId]) return prev
          const next = { ...prev }
          delete next[filmId]
          return next
        })
      }, 4000)
    } catch (err) {
      console.error('Resend invite error:', err)
      setResendStatusByFilm((prev) => ({ ...prev, [filmId]: 'error' }))
      if (resendStatusTimeouts.current[filmId]) {
        clearTimeout(resendStatusTimeouts.current[filmId])
      }
      resendStatusTimeouts.current[filmId] = setTimeout(() => {
        setResendStatusByFilm((prev) => {
          if (!prev[filmId]) return prev
          const next = { ...prev }
          delete next[filmId]
          return next
        })
      }, 4000)
    }
  }

  const handleResendInvite = async (inviteId) => {
    setResendStatusByInvite((prev) => ({ ...prev, [inviteId]: 'sending' }))
    try {
      await api.resendInviteById(inviteId, window?.location?.origin || null)
      setResendStatusByInvite((prev) => ({ ...prev, [inviteId]: 'sent' }))
      if (resendInviteTimeouts.current[inviteId]) {
        clearTimeout(resendInviteTimeouts.current[inviteId])
      }
      resendInviteTimeouts.current[inviteId] = setTimeout(() => {
        setResendStatusByInvite((prev) => {
          if (!prev[inviteId]) return prev
          const next = { ...prev }
          delete next[inviteId]
          return next
        })
      }, 4000)
    } catch (err) {
      console.error('Resend invite error:', err)
      setResendStatusByInvite((prev) => ({ ...prev, [inviteId]: 'error' }))
      if (resendInviteTimeouts.current[inviteId]) {
        clearTimeout(resendInviteTimeouts.current[inviteId])
      }
      resendInviteTimeouts.current[inviteId] = setTimeout(() => {
        setResendStatusByInvite((prev) => {
          if (!prev[inviteId]) return prev
          const next = { ...prev }
          delete next[inviteId]
          return next
        })
      }, 4000)
    }
  }

  const openShareModal = () => {
    setModalError('')
    setModalFirst('')
    setModalLast('')
    setModalEmail('')
    setModalNote('')
    setIsShareModalOpen(true)
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

  const handleSendModalInvite = async () => {
    setModalError('')
    if (!viewerFilmId) {
      setModalError('No film is linked to your account yet.')
      return
    }
    if (!modalFirst.trim() || !modalLast.trim()) {
      setModalError('Enter a first and last name.')
      return
    }
    if (!modalEmail.trim() || !modalEmail.includes('@')) {
      setModalError('Enter a valid email.')
      return
    }
    // Personal notes are mandatory — the note is the gift, not the link.
    if (!modalNote.trim()) {
      setModalError('Add a personal note — even one warm sentence about why this film made you think of them.')
      return
    }
    setModalBusy(true)
    try {
      const { data: existing } = await supabase
        .from('invites')
        .select('id')
        .eq('film_id', viewerFilmId)
        .ilike('recipient_email', modalEmail.trim())
        .limit(1)
        .maybeSingle()

      if (existing) {
        const name = modalFirst.trim() || modalEmail.trim().split('@')[0]
        setModalError(`${name} has already received an invitation to this film. Try someone else.`)
        setModalBusy(false)
        return
      }

      // recipientName stays first-name only; the last name rides in its own column.
      const recipientName = modalFirst.trim()
      await api.sendInvite(
        viewerFilmId,
        modalEmail.trim(),
        recipientName,
        profile.name,
        profile.id,
        profile.email,
        modalNote.trim() || null,
        window.location.origin,
        viewerFocusInviteId || null,
        modalFirst.trim(),
        modalLast.trim()
      )
      await fetchProfile(profile.id)
      const newId = await loadViewerDashboard()
      setNewestInviteId(newId)
      setIsShareModalOpen(false)
    } catch (e) {
      setModalError(e.message || 'Could not send invitation.')
    } finally {
      setModalBusy(false)
    }
  }

  const creatorTotalInvites = Object.values(filmStats).reduce((a, s) => a + (s.sent || 0), 0)

  /* ===================== VIEWER V3 DIPTYCH ===================== */
  if (isViewer) {
    // Show the account holder's name whole (no split). Names are first-name-only now; for
    // legacy accounts the full stored name shows, which is an acceptable cosmetic effect.
    const firstNameDisplay = profile.name?.trim() || 'there'

    return (
      <div className="relative z-10 flex min-h-dvh w-full flex-col overflow-hidden bg-bg-page text-warm md:flex-row">
        {/* Mobile top bar — viewer */}
        <div className="flex items-center justify-between border-b border-faint/30 bg-ink/80 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] lg:hidden">
          <Link to="/" className="inline-block opacity-90 hover:opacity-100">
            <DeepcastLogo variant="wordmark" className="h-5 w-auto text-warm" />
          </Link>
          <button
            type="button"
            onClick={() => setViewerSidebarOpen((v) => !v)}
            className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center text-warm/70"
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              {viewerSidebarOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        <aside className={`${viewerSidebarOpen ? 'flex' : 'hidden'} lg:flex w-full min-h-0 shrink-0 flex-col gap-6 overflow-y-auto border-b border-faint/30 bg-ink/80 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-4 sm:px-6 sm:py-10 panel-scroll lg:max-h-[100dvh] lg:w-[22%] lg:min-h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-10`}>
          {/* Mobile menu = navigation only (About / Edit your first name / Sign out).
              Stats + share live on the main page's strip; everything below that's
              hidden on mobile stays exactly as-is on desktop (lg:). */}
          <div className="hidden shrink-0 animate-fade-in lg:block">
            <Link to="/" className="hidden lg:inline-block">
              <DeepcastLogo variant="wordmark" className="!text-4xl sm:!text-5xl text-warm" />
            </Link>
            <h2 className="font-serif-v3 lg:mt-3 text-xl text-warm">{profile.name}</h2>
          </div>

          <div
            className="hidden h-px w-full shrink-0 bg-warm/[0.08] animate-fade-in lg:block"
            style={{ animationDelay: '60ms' }}
          />

          <div
            className="hidden shrink-0 flex-col gap-7 animate-fade-in lg:flex"
            style={{ animationDelay: '100ms' }}
          >
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-warm/45">
                Tickets given
              </span>
              <span className="font-display text-[2.35rem] font-normal leading-none tracking-tight text-warm md:text-[2.5rem]">
                {sentCount}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-warm/45">
                Tickets left
              </span>
              {invitesLeft === Infinity ? (
                <span className="font-display text-2xl font-normal leading-none tracking-tight text-accent">
                  Unlimited
                </span>
              ) : (
                <span className="font-display text-[2.35rem] font-normal leading-none tracking-tight text-accent md:text-[2.5rem]">
                  {invitesLeft}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <ReachExplainer />
              <span className="font-display text-[2.35rem] font-normal leading-none tracking-tight text-warm md:text-[2.5rem]">
                {viewerReachedCount}
              </span>
            </div>
            {/* Frozen at claim time (claim_ordinal) — never recomputed. */}
            {isClaimant && formatOrdinal(profile.claim_ordinal) && (
              <p className="font-sans text-[10px] uppercase tracking-[0.2em] text-warm/50">
                You are the {formatOrdinal(profile.claim_ordinal)} person to be invited to watch
                this film.
              </p>
            )}
            {/* The platform-concept line, quietly (its primary home is the
                share panel). Founder-approved verbatim (2026-07-16) — kept
                unmodified here too: the dashboard always has a selected film
                in frame, so the sentence reads correctly as-is. */}
            <p className="font-serif-v3 text-xs italic leading-relaxed text-warm/45">
              This film reached you because someone thought of you. No algorithm, no feed. Films
              here pass through human hands only.
            </p>
          </div>

          <div
            className="hidden h-[0.5px] w-full shrink-0 bg-accent/20 animate-fade-in lg:block"
            style={{ animationDelay: '140ms' }}
          />

          <div
            className="flex shrink-0 flex-col gap-3 animate-fade-in"
            style={{ animationDelay: '160ms' }}
          >
            {canShareMore && (
              <button
                type="button"
                onClick={openShareModal}
                disabled={shareDisabled}
                className="hidden w-full bg-accent px-4 py-4 text-center font-sans text-[11px] font-semibold uppercase tracking-[0.28em] text-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 lg:block"
              >
                Share this film
              </button>
            )}
            {/* Account-only affordances — hidden for accountless claimants:
                /about is ProtectedRoute-gated, the name edit writes the users
                row (RLS self-only), and there is no session to sign out of. */}
            {!isClaimant && (
            <Link
              to="/about"
              className="text-left font-sans text-[10px] uppercase tracking-[0.22em] text-warm/35 transition-colors hover:text-warm/70"
            >
              About
            </Link>
            )}
            {isClaimant ? null : !editingName ? (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(profile.name || '')
                  setNameError('')
                  setEditingName(true)
                }}
                className="text-left font-sans text-[10px] uppercase tracking-[0.22em] text-warm/35 transition-colors hover:text-warm/70"
              >
                Edit your first name
              </button>
            ) : (
              <div className="flex flex-col gap-2.5">
                <span className="font-sans text-[9px] uppercase tracking-[0.22em] text-warm/50">
                  First name
                </span>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  maxLength={50}
                  autoFocus
                  aria-label="First name"
                  className="w-full border-b border-warm/20 bg-transparent pb-1 font-serif-v3 text-base text-warm placeholder-warm/30 focus:border-accent/60 focus:outline-none"
                  placeholder="First name"
                />
                <p className="font-serif-v3 text-xs italic text-warm/45">
                  This is how your name appears on the network.
                </p>
                {nameError && (
                  <p className="font-sans text-[9px] uppercase tracking-[0.18em] text-error/90">{nameError}</p>
                )}
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleSaveName}
                    disabled={nameBusy}
                    className="font-sans text-[10px] uppercase tracking-[0.22em] text-accent transition-colors hover:text-accent-hover disabled:opacity-50"
                  >
                    {nameBusy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingName(false)}
                    disabled={nameBusy}
                    className="font-sans text-[10px] uppercase tracking-[0.22em] text-warm/35 transition-colors hover:text-warm/70 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {!isClaimant && (
            <button
              type="button"
              onClick={() => signOut()}
              className="text-left font-sans text-[10px] uppercase tracking-[0.28em] text-warm/50 transition-colors hover:text-warm"
            >
              Sign out
            </button>
            )}
          </div>
        </aside>

        <main className="flex w-full min-h-0 flex-1 flex-col overflow-y-auto bg-[#0c1225] px-4 py-8 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] panel-scroll sm:px-6 sm:py-10 md:px-12 lg:flex-1 lg:py-14 lg:pl-14 lg:pr-16">
          {inviteSentConfirmation && (
            <div className="mb-8 w-full max-w-6xl border border-[#5b8a5e]/30 bg-[#5b8a5e]/10 px-6 py-4 animate-fade-in">
              <p className="font-sans text-[11px] uppercase tracking-[0.25em] text-[#5b8a5e]">
                Invitation sent to {inviteSentConfirmation} — they&apos;ll receive a private screening link.
              </p>
            </div>
          )}
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-24">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : !viewerFilmId ? (
            <div className="mx-auto max-w-lg py-20 text-center animate-fade-in">
              <p className="text-sm text-text-muted">
                You’re signed in. Open a screening link from your email to connect a film to this
                dashboard; then you can track shares and send invitations.
              </p>
              <Link
                to="/profile"
                className="mt-8 inline-block text-xs uppercase tracking-widest text-accent hover:text-accent-hover"
              >
                Profile
              </Link>
            </div>
          ) : (
            <>
              {/* Mobile-only stats strip (lg:hidden — desktop keeps the always-visible
                  sidebar untouched): the SAME key numbers as the sidebar, same canonical
                  values and styling, visible immediately without opening the hamburger. */}
              <section
                aria-label="Your stats"
                className="mb-10 grid w-full max-w-6xl grid-cols-2 gap-x-8 gap-y-7 animate-fade-in lg:hidden"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-warm/45">
                    Tickets given
                  </span>
                  <span className="font-display text-[2.35rem] font-normal leading-none tracking-tight text-warm">
                    {sentCount}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="font-sans text-[10px] font-medium uppercase tracking-[0.22em] text-warm/45">
                    Tickets left
                  </span>
                  {invitesLeft === Infinity ? (
                    <span className="font-display text-2xl font-normal leading-none tracking-tight text-accent">
                      Unlimited
                    </span>
                  ) : (
                    <span className="font-display text-[2.35rem] font-normal leading-none tracking-tight text-accent">
                      {invitesLeft}
                    </span>
                  )}
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <ReachExplainer tipBelow />
                  <span className="font-display text-[2.35rem] font-normal leading-none tracking-tight text-warm">
                    {viewerReachedCount}
                  </span>
                </div>
                {/* Frozen at claim time (claim_ordinal) — never recomputed. */}
                {isClaimant && formatOrdinal(profile.claim_ordinal) && (
                  <p className="col-span-2 font-sans text-[10px] uppercase tracking-[0.2em] text-warm/50">
                    You are the {formatOrdinal(profile.claim_ordinal)} person to be invited to
                    watch this film.
                  </p>
                )}
              </section>

              {/* ── Your screenings ── */}
              {viewerAllFilms.length > 0 && (
                <section className="mb-10 w-full max-w-6xl animate-fade-in" style={{ animationDelay: '40ms' }}>
                  <h3 className="mb-5 font-sans text-[10px] font-medium uppercase tracking-[0.32em] text-warm/50">
                    Your screenings
                  </h3>
                  <div className="flex flex-col gap-3">
                    {viewerAllFilms.map((film) => {
                      const isSelected = film.id === viewerFilmId
                      // State-aware card (screeningCard.js): surfaces invite
                      // status + the saved resume position. Claim-flow keys
                      // are slug-scoped; the legacy flow stores seconds only
                      // (no fraction → no bar).
                      const claimKeys = isClaimant && claimStash?.slug
                      const posKey = claimKeys
                        ? `screening_position_slug_${claimStash.slug}`
                        : `screening_position_${film.token}`
                      const card = screeningCardState({
                        status: film.status,
                        savedSeconds: Number(safeLocalStorage.getItem(posKey)) || 0,
                        progressFraction: claimKeys
                          ? Number(safeLocalStorage.getItem(`screening_progress_slug_${claimStash.slug}`)) || null
                          : null,
                      })
                      // The ENTIRE card is one clickable target → the watch page.
                      const goWatch = () => {
                        if (claimKeys) {
                          navigate(
                            card.mode === 'again'
                              ? `/watch/${claimStash.slug}?again=1`
                              : `/watch/${claimStash.slug}`
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
                        className={`relative flex cursor-pointer flex-col gap-4 border bg-[#0a0f1a] p-4 transition-colors sm:flex-row sm:items-center sm:gap-5 ${
                          isSelected ? 'border-accent/60' : 'border-faint/20 hover:border-faint/40'
                        }`}
                      >
                        {/* Thin, quiet progress indicator (in-progress cards only). */}
                        {card.progress != null && (
                          <div aria-hidden className="absolute bottom-0 left-0 right-0 h-[2px] bg-warm/10">
                            <div
                              className="h-full bg-accent/70"
                              style={{ width: `${Math.round(card.progress * 100)}%` }}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-4 min-w-0 sm:gap-5">
                          {film.thumbnail_url ? (
                            <img
                              src={film.thumbnail_url}
                              alt={film.title}
                              className="h-16 w-28 shrink-0 object-cover"
                            />
                          ) : (
                            <div className="flex h-16 w-28 shrink-0 items-center justify-center bg-faint/10">
                              <svg className="h-5 w-5 text-warm/20 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                          )}
                          <div className="flex flex-1 flex-col gap-1 min-w-0">
                            <p className="font-serif-v3 text-base italic leading-snug text-warm truncate">{film.title}</p>
                            {isSelected && (
                              <span className="font-sans text-[9px] uppercase tracking-[0.25em] text-accent/70">
                                Viewing
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:ml-auto">
                          {(film.token || claimKeys) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                goWatch()
                              }}
                              className="flex items-center gap-1.5 border border-warm/20 px-4 py-2 font-sans text-[10px] uppercase tracking-[0.25em] text-warm/60 transition-colors hover:border-warm/40 hover:text-warm"
                            >
                              <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                              {card.label}
                            </button>
                          )}
                          {canShareMore && film.id === viewerFilmId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openShareModal()
                              }}
                              disabled={shareDisabled}
                              className="flex items-center gap-1.5 border border-accent/40 px-4 py-2 font-sans text-[10px] uppercase tracking-[0.25em] text-accent/70 transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-accent/40 disabled:hover:text-accent/70"
                            >
                              <svg className="h-2.5 w-2.5 fill-current" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 0 0 18 8a3 3 0 1 0-3-3c0 .24.04.47.09.7L8.04 9.81A2.99 2.99 0 0 0 6 9a3 3 0 1 0 0 6c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65a3 3 0 1 0 3-3z"/></svg>
                              Share more
                            </button>
                          )}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </section>
              )}

              <section
                className="mb-14 w-full max-w-6xl animate-fade-in"
                style={{ animationDelay: '80ms' }}
              >
                {sentCount > 0 ? (
                  <>
                    <p className="font-serif-v3 mb-5 text-[1.55rem] leading-[1.25] italic text-warm sm:text-[1.85rem] md:text-[2.05rem]">
                      Your shares have been sent, {firstNameDisplay}.
                    </p>
                    <p className="mb-12 max-w-2xl font-body text-[0.95rem] font-light leading-[1.75] text-warm/65 md:text-base">
                      {formattedRecipientNames}{' '}
                      {sentCount === 1 ? 'has' : 'have'} been brought into the fold, growing the
                      network. Come back to watch your impact spread.
                      <span className="hidden lg:inline"> Your full network map is below.</span>
                      <span className="lg:hidden"> Scroll for your impact map.</span>
                    </p>
                  </>
                ) : (
                  <p className="mb-12 max-w-2xl font-body text-[0.95rem] font-light leading-[1.75] text-warm/70 md:text-base">
                    You’re connected to <span className="italic">{viewerFilmTitle}</span>.
                    <span className="hidden lg:inline">
                      {' '}
                      Your live invitation map is below — scroll and drag to explore.
                    </span>
                    <span className="lg:hidden"> Scroll down for your live invitation map.</span>
                    <br />
                    <span className="text-warm/55">
                      When you send invitations, the map and list below update together.
                    </span>
                  </p>
                )}

                {graphLayout ? (
                  <div className="mb-12 flex w-full flex-col animate-fade-in">
                    <div className="mb-5 flex flex-row items-baseline justify-between gap-4">
                      <h3 className="font-sans text-[10px] font-medium uppercase tracking-[0.32em] text-warm/50">
                        My network impact
                      </h3>
                      <span className="max-w-[min(100%,14rem)] text-right font-serif-v3 text-[12px] italic leading-snug tracking-wide text-warm/65 sm:max-w-[20rem] sm:text-[13px]">
                        {viewerFilmTitle}
                      </span>
                    </div>
                    <div className="relative flex h-[850px] w-full overflow-hidden bg-[#121a33]">
                      <NetworkGraph
                        fillHeight
                        pannable
                        showZoomControls
                        showLegend
                        hideSectionLabels
                        transparentSurface
                        edgeFadeColor="#121a33"
                        nodesData={graphLayout.nodesData}
                        linksData={graphLayout.linksData}
                        viewBoxH={graphLayout.viewBoxH}
                        viewBoxW={graphLayout.viewBoxW}
                        ringRadii={graphLayout.ringRadii}
                        sectionLabels={graphLayout.sectionLabels}
                        rootNode={graphLayout.rootNode}
                        defaultActiveNodes={graphLayout.defaultActiveNodes}
                        defaultActiveLinks={graphLayout.defaultActiveLinks}
                        focusNodeId={newestInviteId}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mb-10 font-sans text-[10px] uppercase tracking-widest text-warm/35">
                    Your network map will appear here after invitations are sent.
                  </p>
                )}
              </section>

              <section
                className="mb-24 w-full max-w-6xl animate-fade-in"
                style={{ animationDelay: '120ms' }}
              >
                <h3 className="mb-6 border-b border-faint/25 pb-4 font-sans text-[10px] font-medium uppercase tracking-[0.32em] text-warm/50">
                  Sent invitations
                </h3>
                <div className="flex flex-col gap-4">
                  {viewerSentInvites.length === 0 ? (
                    <div className="border border-dashed border-faint/25 bg-[#0a0f1a]/40 p-8 text-center font-sans text-[10px] uppercase tracking-widest text-warm/25">
                      No active invitations
                    </div>
                  ) : (
                    viewerSentInvites.slice(0, visibleSentCount).map((inv, index) => {
                      const displayName =
                        inv.recipient_name?.trim() ||
                        inv.recipient_email?.split('@')[0] ||
                        'Recipient'
                      const reached = reachByInvite[inv.id] || 0
                      const opened = isOpened(inv)
                      return (
                        <div
                          key={inv.id}
                          className="flex flex-col items-stretch justify-between gap-4 border border-faint/30 bg-[#0a0f1a]/50 p-6 transition-colors hover:border-faint/45 sm:flex-row sm:items-center md:p-8"
                        >
                          <div className="flex flex-col gap-4">
                            <div>
                              <span className="mb-1 block font-sans text-[9px] font-medium uppercase tracking-[0.35em] text-warm/35">
                                Invitation {String(index + 1).padStart(2, '0')}
                              </span>
                              <h4 className="font-serif-v3 text-2xl italic leading-tight text-warm md:text-[1.65rem]">
                                {displayName}
                              </h4>
                            </div>
                            <div className="flex flex-wrap gap-10">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-sans text-[9px] uppercase tracking-[0.2em] text-warm/40">
                                  People they&apos;ve reached
                                </span>
                                <span className="font-display text-xl font-normal text-accent">{reached}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5 self-start border border-warm/15 bg-[#05070a]/80 px-5 py-2 sm:self-center">
                            <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${opened ? 'bg-accent' : 'bg-warm/25'}`} />
                            <span className={`font-sans text-[10px] font-medium uppercase tracking-[0.22em] ${opened ? 'text-warm/85' : 'text-warm/45'}`}>
                              {opened ? 'Invite opened' : 'Invite unopened'}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                  {viewerSentInvites.length > visibleSentCount && (
                    <button
                      type="button"
                      onClick={() => setVisibleSentCount((n) => n + SENT_LIST_PAGE_SIZE)}
                      className="w-full border border-faint/30 bg-[#0a0f1a]/40 py-4 text-center font-sans text-[10px] uppercase tracking-[0.25em] text-warm/50 transition-colors hover:border-faint/50 hover:text-warm/80"
                    >
                      Show more ({viewerSentInvites.length - visibleSentCount} remaining)
                    </button>
                  )}
                </div>
              </section>

              <footer className="w-full py-12 text-center font-sans text-[10px] uppercase tracking-widest text-warm/40">
                &copy; {new Date().getFullYear()}{' '}
                <span className="font-sans font-semibold normal-case">Deepcast</span>.
                <MvpVersionLabel className="mt-2" />
              </footer>
            </>
          )}
        </main>

        {isShareModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-lg sm:p-8">
            <div
              className="relative flex w-full max-w-2xl flex-col items-center overflow-hidden p-10 shadow-2xl sm:p-12"
              style={{
                background:
                  'linear-gradient(168deg, #e8e2d6 0%, #ddd8cc 30%, #d5cfc3 60%, #ddd7cb 100%)',
                borderRadius: '8px',
                boxShadow:
                  '0 2px 30px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(180,170,150,0.4)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E")`,
                  opacity: 0.08,
                  mixBlendMode: 'multiply',
                }}
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  boxShadow:
                    'inset 0 0 60px rgba(0,0,0,0.06), inset 0 0 120px rgba(0,0,0,0.03)',
                }}
              />
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="absolute right-6 top-6 z-10 text-2xl text-[#2a2a2a]/40 transition-colors hover:text-[#2a2a2a]/70"
                aria-label="Close"
              >
                &times;
              </button>
              <h3 className="relative z-10 mb-10 font-sans text-[10px] uppercase tracking-[0.4em] text-[#6b5d4a]">
                New invitation
              </h3>
              {modalError && (
                <p className="relative z-10 mb-4 text-center text-sm text-red-700">{modalError}</p>
              )}
              <div className="relative z-10 flex w-full flex-col items-center gap-4">
                <div className="flex w-full flex-nowrap items-baseline justify-center gap-1 whitespace-nowrap font-serif-v3 text-xl italic text-[#2a2a2a] sm:gap-2">
                  <span>Dear</span>
                  <input
                    type="text"
                    placeholder="First name"
                    value={modalFirst}
                    onChange={(e) => setModalFirst(e.target.value)}
                    className="min-w-0 flex-1 border-b border-[#6b5d4a]/40 bg-transparent text-center text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none"
                    autoComplete="given-name"
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={modalLast}
                    onChange={(e) => setModalLast(e.target.value)}
                    className="min-w-0 flex-1 border-b border-[#6b5d4a]/40 bg-transparent text-center text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none"
                    autoComplete="family-name"
                  />
                  <span>,</span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Write your note here. Tell them why this film made you think of them specifically…"
                  value={modalNote}
                  onChange={(e) => setModalNote(e.target.value)}
                  className="w-full resize-none border-none bg-transparent text-center font-serif-v3 text-xl italic text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none"
                />
                <input
                  type="email"
                  placeholder="Deliver to (email)"
                  value={modalEmail}
                  onChange={(e) => setModalEmail(e.target.value)}
                  className="relative z-10 w-full max-w-xs border-b border-[#6b5d4a]/30 bg-transparent text-center text-[13px] text-[#2a2a2a] placeholder-[#2a2a2a]/30 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={modalBusy}
                  onClick={handleSendModalInvite}
                  className="relative z-10 mt-4 w-full rounded py-4 font-sans text-[11px] uppercase tracking-widest text-[#e8e2d6] transition-colors bg-[#6b5d4a] hover:bg-[#5a4d3a] disabled:opacity-50"
                >
                  {modalBusy ? 'Sending…' : 'Send invitation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
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
            <span className="block text-warm/50">Invites (all films)</span>
            <span className="font-display text-2xl font-light text-warm">{creatorTotalInvites}</span>
          </div>
          {(profile.role === 'creator' || isTeamMember) && (
            <p className="normal-case text-warm/45">Unlimited invites</p>
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
            <span className="block text-warm/50">Invites (all films)</span>
            <span className="font-display text-2xl font-light text-warm">{creatorTotalInvites}</span>
          </div>
          {(profile.role === 'creator' || isTeamMember) && (
            <p className="self-end normal-case text-warm/45">Unlimited invites</p>
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
              const tree = inviteTree[film.id] || []
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
                        {isInviteOpen ? 'Close' : 'Invite friends'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResendLastInvite(film.id)}
                        className="text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text disabled:opacity-50"
                        disabled={resendStatusByFilm[film.id] === 'sending'}
                      >
                        {resendStatusByFilm[film.id] === 'sending'
                          ? 'Resending...'
                          : 'Resend last invite'}
                      </button>
                      {inviteSentByFilm[film.id] && (
                        <span className="text-xs uppercase tracking-wider text-success">
                          Invitations sent
                        </span>
                      )}
                      {resendStatusByFilm[film.id] === 'sent' && (
                        <span className="text-xs uppercase tracking-wider text-success">
                          Invite resent
                        </span>
                      )}
                      {resendStatusByFilm[film.id] === 'error' && (
                        <span className="text-xs uppercase tracking-wider text-error">
                          Resend failed
                        </span>
                      )}
                      <span
                        className={`rounded-none px-3 py-1 text-xs uppercase tracking-wider ${statusBadge[film.status]}`}
                      >
                        {film.status}
                      </span>
                    </div>
                  </div>

                  {isInviteOpen && (
                    <div className="mb-6">
                      <InviteForm
                        filmId={film.id}
                        senderName={profile.name}
                        senderEmail={profile.email}
                        senderId={profile.id}
                        maxInvites={10}
                        unlimited
                        onInviteSent={() => {
                          fetchProfile(profile.id)
                          loadDashboard()
                          setInviteFilmId(null)
                          setInviteSentByFilm((prev) => ({ ...prev, [film.id]: true }))
                          if (inviteSentTimeouts.current[film.id]) {
                            clearTimeout(inviteSentTimeouts.current[film.id])
                          }
                          inviteSentTimeouts.current[film.id] = setTimeout(() => {
                            setInviteSentByFilm((prev) => {
                              if (!prev[film.id]) return prev
                              const next = { ...prev }
                              delete next[film.id]
                              return next
                            })
                          }, 4000)
                        }}
                      />
                    </div>
                  )}

                  <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { label: 'Invited', value: stats.sent || 0 },
                      { label: 'Opened', value: stats.opened || 0 },
                      { label: 'Watched', value: stats.watched || 0 },
                      { label: 'Signed up', value: stats.signedUp || 0 },
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

                  {!isTeamMember && tree.length > 0 && (
                    <div>
                      <p className="mb-3 text-xs uppercase tracking-wider text-text-muted">
                        Invite chain
                      </p>
                      <div className="space-y-2">
                        {tree.map((node, i) => (
                          <div
                            key={node.id || i}
                            className="flex flex-wrap items-center gap-2 text-xs text-text-muted"
                          >
                            <span className="text-text">{node.sender}</span>
                            <span>&rarr;</span>
                            <span>{node.recipient}</span>
                            <button
                              type="button"
                              onClick={() => handleResendInvite(node.id)}
                              className="text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-text disabled:opacity-50"
                              disabled={resendStatusByInvite[node.id] === 'sending'}
                            >
                              {resendStatusByInvite[node.id] === 'sending'
                                ? 'Resending...'
                                : 'Resend'}
                            </button>
                            {resendStatusByInvite[node.id] === 'sent' && (
                              <span className="text-[10px] uppercase tracking-wider text-success">
                                Sent
                              </span>
                            )}
                            {resendStatusByInvite[node.id] === 'error' && (
                              <span className="text-[10px] uppercase tracking-wider text-error">
                                Failed
                              </span>
                            )}
                            {node.senderId === profile.id &&
                              (() => {
                                const email = (node.recipient || '').trim().toLowerCase()
                                const status = unlimitedStatuses[email]
                                if (!status) return null
                                if (!status.eligible) {
                                  return status.hasAccount ? null : (
                                    <span className="text-[10px] uppercase tracking-wider text-text-muted/50">
                                      No account yet
                                    </span>
                                  )
                                }
                                const first =
                                  (node.recipientName || '').trim().split(/\s+/)[0] ||
                                  email.split('@')[0]
                                if (unlimitedConfirm[email]) {
                                  return (
                                    <span className="flex flex-wrap items-center gap-2 normal-case">
                                      <span className="text-[11px] text-text">
                                        {status.unlimited
                                          ? `Return ${first} to the standard share count?`
                                          : `Give ${first} unlimited shares?`}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setUnlimitedConfirm((p) => ({ ...p, [email]: false }))
                                          handleToggleUnlimited(email)
                                        }}
                                        className="text-[10px] uppercase tracking-wider text-accent transition-colors hover:text-accent-hover"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setUnlimitedConfirm((p) => ({ ...p, [email]: false }))}
                                        className="text-[10px] uppercase tracking-wider text-text-muted transition-colors hover:text-text"
                                      >
                                        Cancel
                                      </button>
                                    </span>
                                  )
                                }
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setUnlimitedConfirm((p) => ({ ...p, [email]: true }))}
                                      disabled={Boolean(unlimitedBusy[email])}
                                      aria-pressed={status.unlimited}
                                      className={`rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.18em] transition-colors disabled:opacity-50 ${
                                        status.unlimited
                                          ? 'border-accent/50 text-accent hover:border-accent'
                                          : 'border-border text-text-muted hover:border-text-muted hover:text-text'
                                      }`}
                                    >
                                      {unlimitedBusy[email]
                                        ? 'Saving…'
                                        : status.unlimited
                                          ? 'Unlimited shares'
                                          : 'Standard · 5 shares'}
                                    </button>
                                    {unlimitedError[email] && (
                                      <span className="text-[10px] normal-case text-error">
                                        {unlimitedError[email]}
                                      </span>
                                    )}
                                  </>
                                )
                              })()}
                            <span
                              className={`ml-auto uppercase tracking-wider ${
                                node.status === 'watched' || node.status === 'signed_up'
                                  ? 'text-success'
                                  : node.status === 'opened'
                                    ? 'text-accent'
                                    : ''
                              }`}
                            >
                              {node.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
