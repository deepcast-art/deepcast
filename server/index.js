import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Mux from '@mux/mux-node'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { buildGraphLayout } from '../src/lib/graphLayout.js'
import { createEmailDispatcher } from './emailDelivery.js'
import { isInviteUsable } from './inviteValidation.js'
import { CREATOR_SHARE_BLOCK_REASON, isShareToFilmCreator } from './shareRules.js'
import { adminAuthDecision, ticketControlTargetDecision } from './adminAuth.js'
import {
  deletePersonTargetDecision,
  deleteConfirmDecision,
  deleteTicketTargetDecision,
} from './deleteRules.js'
import { buildDeletePlan, executeDeletePlan } from './deleteSplice.js'
import { removeTeammateDecision } from './teamRules.js'
import { generateUniqueSlug } from './inviteSlug.js'
import { resolveAccountlessSharerIdentity } from './claimIdentity.js'
import { INITIAL_CLAIMANT_TICKETS, ticketSpendDecision, NO_TICKETS_MESSAGE } from '../src/lib/ticketRules.js'
import { invitationsRemaining, isRoleUnlimitedSharer, filmTicketsRemaining } from '../src/lib/shares.js'
import {
  readFilmWallet,
  initFilmWallet,
  spendFilmTicket,
  refundFilmTicket,
  grantFilmTickets,
} from './filmWallet.js'
import { claimedSharerSpendDecision, claimedInviteTicketsDisplay } from './claimantWallet.js'

const app = express()
app.use(cors())
app.use(express.json())

// Mux client
const muxTokenId = process.env.MUX_TOKEN_ID
const muxTokenSecret = process.env.MUX_TOKEN_SECRET
if (!muxTokenId || !muxTokenSecret) {
  console.warn('Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET in environment.')
}
const mux = new Mux({
  tokenId: muxTokenId,
  tokenSecret: muxTokenSecret,
})

// Resend client
const resendApiKey = process.env.RESEND_API_KEY
if (!resendApiKey) {
  console.warn('Missing RESEND_API_KEY in environment.')
}
const resend = new Resend(resendApiKey)

{
  const f = process.env.RESEND_FROM_EMAIL || ''
  if (!f.trim()) {
    console.warn('[email] RESEND_FROM_EMAIL is not set. Using fallback: invites@deepcast.art. Set it to an address on a verified Resend domain.')
  } else if (/@resend\.dev/i.test(f)) {
    console.warn('[email] RESEND_FROM_EMAIL uses resend.dev — delivery is restricted to your Resend account. Use a verified custom domain so any recipient can receive mail.')
  }
}

// Supabase admin client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseKey) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY in environment.')
}

function getJwtRole(jwt) {
  try {
    const payload = jwt.split('.')[1]
    const decoded = Buffer.from(payload, 'base64').toString('utf8')
    return JSON.parse(decoded).role
  } catch {
    return null
  }
}

const supabaseKeyRole = getJwtRole(supabaseKey)
if (supabaseKeyRole !== 'service_role') {
  console.warn('Supabase key is not service_role. Current role:', supabaseKeyRole)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// App base URL
// Public origin for invite links, email templates, unsubscribe, etc. Production must set APP_URL on
// the host (e.g. Render). The localhost default is only when env is missing — local dev / tests.
const APP_URL = process.env.APP_URL || 'http://localhost:3000'

/**
 * expires_at stamped on new film invites (default 3650 days ≈ 10y). The value is
 * informational only — invite links never expire in the MVP and nothing enforces
 * this date (see server/inviteValidation.js). Far-future by default so that if
 * expiration is reintroduced post-MVP, MVP-era links don't retroactively die.
 * Set INVITE_EXPIRY_DAYS to override. Capped at 3650.
 */
function getFilmInviteExpiryDays() {
  const raw = process.env.INVITE_EXPIRY_DAYS
  if (raw == null || String(raw).trim() === '') return 3650
  const n = parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n <= 0) return 3650
  return Math.min(n, 3650)
}

/** Liveness for deploy pipelines and smoke tests — no DB or external services. */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'deepcast-api',
    timestamp: new Date().toISOString(),
  })
})

// ============ GRAPH LAYOUT (testing) ============

app.get('/api/graph/layout/:filmId', async (req, res) => {
  try {
    const { filmId } = req.params
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Invites and the film row are independent — fetch together (cross-region round trips dominate).
    const [{ data: invites, error: invErr }, { data: film }] = await Promise.all([
      supabase
        .from('invites')
        .select('id, film_id, sender_name, sender_email, sender_id, recipient_name, recipient_email, status, parent_invite_id, created_at')
        .eq('film_id', filmId)
        .order('created_at', { ascending: true }),
      supabase.from('films').select('title, creator_id').eq('id', filmId).single(),
    ])

    if (invErr) return res.status(500).json({ error: invErr.message })
    if (!invites?.length) return res.status(404).json({ error: 'No invites found for this film' })

    const { data: teamRows } = film?.creator_id
      ? await supabase.from('users').select('id').eq('team_creator_id', film.creator_id)
      : { data: null }

    const layout = buildGraphLayout({
      filmInvites: invites,
      filmTitle: film?.title || 'Film',
      creatorName: '',
      creatorId: film?.creator_id || null,
      teamMemberIds: (teamRows || []).map((u) => u.id),
      viewerRecipientKey: null,
    })

    if (!layout) return res.status(404).json({ error: 'Could not build graph layout' })

    res.json({
      filmId,
      filmTitle: film?.title || null,
      inviteCount: invites.length,
      nodeCount: layout.nodesData.length,
      linkCount: layout.linksData.length,
      ringCount: layout.ringRadii.length - 1,
      ringRadii: layout.ringRadii,
      viewBoxW: layout.viewBoxW,
      viewBoxH: layout.viewBoxH,
      nodes: layout.nodesData,
      links: layout.linksData,
      sectionLabels: layout.sectionLabels,
    })
  } catch (err) {
    console.error('[graph/layout]', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ============ MUX ROUTES ============

// Create a Mux direct upload URL
app.post('/api/mux/upload', async (req, res) => {
  try {
    const upload = await mux.video.uploads.create({
      cors_origin: '*',
      new_asset_settings: {
        playback_policy: ['public'],
        encoding_tier: 'baseline',
      },
    })

    // Store the asset creation info — we'll get the asset ID from the upload later
    res.json({
      uploadUrl: upload.url,
      uploadId: upload.id,
      assetId: upload.asset_id || upload.id, // asset may not exist yet
    })
  } catch (err) {
    console.error('Mux upload error:', err)
    res.status(500).json({ error: 'Failed to create upload URL' })
  }
})

// Get Mux asset status
app.get('/api/mux/asset/:id', async (req, res) => {
  try {
    // First try to get it as an upload (since we have upload IDs)
    let assetId = req.params.id

    try {
      const upload = await mux.video.uploads.retrieve(assetId)
      if (upload.asset_id) {
        assetId = upload.asset_id
      }
    } catch {
      // It's already an asset ID, continue
    }

    const asset = await mux.video.assets.retrieve(assetId)
    const playbackId = asset.playback_ids?.[0]?.id || null

    res.json({
      status: asset.status,
      playbackId,
      assetId: asset.id,
    })
  } catch (err) {
    console.error('Mux asset status error:', err)
    res.status(500).json({ error: 'Failed to get asset status' })
  }
})

// Get Mux playback info
app.get('/api/mux/playback/:playbackId', async (req, res) => {
  try {
    // For public playback, return the stream URL
    res.json({
      playbackUrl: `https://stream.mux.com/${req.params.playbackId}.m3u8`,
    })
  } catch (err) {
    console.error('Mux playback error:', err)
    res.status(500).json({ error: 'Failed to get playback URL' })
  }
})

// ============ INVITE ROUTES ============

function generateToken() {
  // 16 bytes → 32-char hex (128-bit). invites.token is `text` (no length cap), so no truncation.
  // Security of the invite-first sign-in flow leans on tokens being unguessable.
  return crypto.randomBytes(16).toString('hex')
}

/**
 * Encrypts {s: senderFirst, r: recipientFirst} with AES-256-CBC.
 * IV is prepended; result is base64url-encoded for safe URL embedding.
 * Client decrypts with VITE_INVITE_CTX_SECRET via WebCrypto.
 */
function encryptInviteCtx(senderFirst, recipientFirst) {
  const secret = process.env.INVITE_CTX_SECRET
  if (!secret || secret.length !== 64) return null
  try {
    const key = Buffer.from(secret, 'hex')
    const iv = crypto.randomBytes(16)
    const payload = JSON.stringify({ s: senderFirst || '', r: recipientFirst || '' })
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
    return Buffer.concat([iv, encrypted]).toString('base64url')
  } catch {
    return null
  }
}

function generateTeamInviteToken() {
  return crypto.randomBytes(24).toString('hex')
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function uuidStringEq(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

function resolveBaseUrl(appUrl, origin) {
  const normalizedAppUrl = typeof appUrl === 'string' ? appUrl.trim() : ''
  const normalizedOrigin = typeof origin === 'string' ? origin.trim() : ''
  const isLocalUrl = (value) => /localhost|127\.0\.0\.1/i.test(value)
  if (normalizedAppUrl && !isLocalUrl(normalizedAppUrl)) return normalizedAppUrl
  if (normalizedOrigin && !isLocalUrl(normalizedOrigin)) return normalizedOrigin
  return APP_URL
}

/** Public site origin for logo + unsubscribe links in screening-invite emails */
function siteOriginFromInviteUrl(inviteUrl) {
  try {
    return new URL(inviteUrl).origin
  } catch {
    return String(APP_URL || '').replace(/\/$/, '')
  }
}

/** RFC 2369 List-Unsubscribe for transactional screening invites */
function withFilmInviteMailingHeaders(payload, inviteUrl) {
  const unsub = `${siteOriginFromInviteUrl(inviteUrl)}/unsubscribe`
  return {
    ...payload,
    headers: {
      ...(payload.headers || {}),
      'List-Unsubscribe': `<${unsub}>`,
    },
  }
}

/** Resend Node SDK returns { data, error } and does NOT throw on API errors — always check `error`. */
function formatResendError(err) {
  if (!err) return 'Unknown Resend error'
  if (typeof err.message === 'string') return err.message
  if (Array.isArray(err.message)) return err.message.map((m) => (typeof m === 'string' ? m : m?.message || JSON.stringify(m))).join('; ')
  return JSON.stringify(err)
}

/** Optional reply-to (inviter) — helps Gmail when aligned with content. */
function withReplyTo(payload, replyEmail) {
  const trimmed = typeof replyEmail === 'string' ? replyEmail.trim() : ''
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return payload
  return { ...payload, reply_to: trimmed }
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Deepcast <invites@deepcast.art>'
const FROM_ADDRESS = FROM_EMAIL.match(/<([^>]+)>/)?.[1] || FROM_EMAIL

async function sendInviteEmailResend(payload) {
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is not set — cannot send email')
  }
  const enriched = {
    ...payload,
    from: payload.from || FROM_EMAIL,
    headers: {
      ...payload.headers,
      'X-Entity-Ref-ID': `dc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  }
  const { data, error } = await resend.emails.send(enriched)
  if (error) {
    const msg = formatResendError(error)
    const to = Array.isArray(payload?.to)
      ? payload.to.join(', ')
      : String(payload?.to || '')
    console.error('Resend API error:', msg, 'to:', to, error)
    const e = new Error(msg)
    e.resendError = error
    throw e
  }
  if (data?.id) {
    const to = Array.isArray(payload?.to)
      ? payload.to.join(', ')
      : String(payload?.to || '')
    console.log('[email] Resend accepted — id:', data.id, 'to:', to)
  }
  return data
}

/**
 * EMAIL DOCTRINE: every outgoing email goes through this one dispatcher —
 * sequential, throttled below Resend's rate limit, retried with backoff.
 * Await it. It resolves only when Resend ACCEPTED the email; if it rejects,
 * the email was not sent and the caller must report that honestly (never
 * answer success to the client before this resolves).
 */
const deliverEmail = createEmailDispatcher({
  sendFn: sendInviteEmailResend,
  onRetry: (err, attempt, payload) => {
    const to = Array.isArray(payload?.to) ? payload.to.join(', ') : String(payload?.to || '')
    console.warn(`[email] attempt ${attempt} failed (will retry) — to: ${to} — ${err?.message || err}`)
  },
})

// "A Sacred Pause" gets a few invite-email customizations gated to this exact film id;
// every other film is unaffected. (Same id used by the screening welcome-message gate.)
const SACRED_PAUSE_FILM_ID = '7c42093d-d5eb-4a38-a9fa-d28ca41d7b0f'

/** Animated-preview GIF for the invite email, built from the film's Mux playback id.
 *  A Sacred Pause renders at 15fps; every other film keeps the original 10fps and the
 *  byte-for-byte identical URL. Returns null when the film has no playback id. */
function buildFilmGifUrl(film, filmId) {
  if (!film.mux_playback_id) return null
  const fps = filmId === SACRED_PAUSE_FILM_ID ? 15 : 10
  return `https://image.mux.com/${film.mux_playback_id}/animated.gif?width=380&fps=${fps}` +
    `${film.gif_start != null ? `&start=${film.gif_start}` : ''}` +
    `${film.gif_end != null ? `&end=${film.gif_end}` : ''}`
}

app.post('/api/invites/send', async (req, res) => {
  try {
    const {
      filmId,
      recipientEmail,
      recipientName,
      recipientFirstName: recipientFirstNameInput,
      recipientLastName: recipientLastNameInput,
      senderName,
      senderId,
      senderEmail,
      personalNote,
      appUrl,
      parentInviteId: clientParentInviteId,
    } = req.body

    if (!filmId || !recipientEmail) {
      return res.status(400).json({ error: 'Film ID and recipient email are required' })
    }

    const recipientEmailNorm = normalizeEmail(recipientEmail)
    if (!recipientEmailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmailNorm)) {
      return res.status(400).json({ error: 'Invalid recipient email address' })
    }

    // Recipient last name is mandatory (the share form collects first + last). Stored in its
    // own column; recipient_name stays first-name only. Don't trust the client to enforce this.
    const recipientLastName =
      typeof recipientLastNameInput === 'string' ? recipientLastNameInput.trim() : ''
    if (!recipientLastName) {
      return res.status(400).json({ error: "Recipient last name is required" })
    }

    // Per-film wallet state (Piece F): the sender's film_tickets row (null =
    // virtual full grant) and whether this request spent a ticket (refunded
    // on any failure after the spend — a failed send is not a spent ticket).
    let senderWallet = null
    let walletSpent = false

    // ── Phase 1: parallel lookups ──────────────────────────────────────────
    // film + sender + parent-invite claim + invite count all fly at once.
    // Sender query includes `email` so the fallback email-match needs no extra round-trip.
    // Count runs here (before insert) and gets +1 applied later for the ordinal.
    const [
      { data: film, error: filmLookupError },
      { data: senderInitial, error: senderError },
      { data: claimedParent },
      { count: preInsertCount, error: inviteCountError },
      { data: existingInvite },
      { data: recipientUser },
    ] = await Promise.all([
      supabase.from('films').select('title, description, thumbnail_url, creator_id, mux_playback_id, gif_start, gif_end').eq('id', filmId).single(),
      // maybeSingle: a missing profile row returns data:null WITHOUT an error, so we can tell a real
      // DB error apart from "profile not created yet" (the passwordless magic-link race) and self-heal.
      senderId
        ? supabase.from('users').select('invite_allocation, role, team_creator_id, unlimited_shares, id, email, name').eq('id', senderId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      clientParentInviteId
        ? supabase.from('invites').select('id, film_id').eq('id', clientParentInviteId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from('invites').select('*', { count: 'exact', head: true }).eq('film_id', filmId),
      supabase.from('invites').select('id').eq('film_id', filmId).ilike('recipient_email', recipientEmailNorm).limit(1).maybeSingle(),
      // Recipient's account (if any) — used to refuse sharing back to the filmmaker.
      supabase.from('users').select('id').ilike('email', recipientEmailNorm).limit(1).maybeSingle(),
    ])

    if (inviteCountError) {
      console.error('Invite count error:', inviteCountError.message || inviteCountError)
    }

    // ── Phase 2: validation (no DB) ────────────────────────────────────────
    if (filmLookupError || !film) {
      return res.status(404).json({ error: 'Film not found' })
    }

    // The film began with its maker — never share it back to them. Predicate-style
    // message: both share forms render failures as "<first name> <reason>".
    if (isShareToFilmCreator({ recipientUserId: recipientUser?.id, filmCreatorId: film.creator_id })) {
      return res.status(400).json({ error: CREATOR_SHARE_BLOCK_REASON })
    }

    if (existingInvite) {
      return res.status(409).json({ error: 'This person has already been invited to this film.' })
    }

    let unlimitedInvites = false
    // Quota-only unlimited (users.unlimited_shares): never blocks on allocation and
    // never decrements, but unlike creator/team unlimited it keeps the normal viewer
    // chain semantics — parent_invite_id is still recorded on every send.
    let unlimitedQuota = false
    let sender = senderInitial

    if (senderId) {
      if (senderError) {
        console.error('Invite allocation lookup error:', senderError.message || senderError)
        return res.status(500).json({ error: 'Unable to verify invites' })
      }
      if (!sender) {
        // Self-heal the profile-before-session race: a valid auth user can briefly have no
        // profile row (passwordless magic-link sign-in). Create it from the auth record rather
        // than hard-failing with "Unable to verify invites".
        sender = await ensureProfileForUserId(senderId)
        if (!sender) {
          return res.status(404).json({ error: 'Sender not found' })
        }
      }

      const role = String(sender.role || '').trim().toLowerCase()
      const creatorOwnsFilm = uuidStringEq(film.creator_id, sender.id)
      const onCreatorTeam =
        sender.team_creator_id != null && uuidStringEq(film.creator_id, sender.team_creator_id)

      if (role === 'creator') {
        if (!creatorOwnsFilm) {
          return res.status(403).json({ error: 'You can only invite people to your own films' })
        }
      } else if (role === 'team_member' || (role === 'viewer' && sender.team_creator_id)) {
        if (!onCreatorTeam) {
          return res.status(403).json({ error: 'You can only invite people to your team\'s films' })
        }
      }

      /* Role-based unlimited stays GLOBAL (creator / team / team-linked). */
      unlimitedInvites =
        role === 'creator' ||
        role === 'team_member' ||
        (role === 'viewer' && onCreatorTeam)

      // Per-film wallet (Piece F): the unlimited FLAG and the balance live on
      // film_tickets(user, film). A missing row is the virtual full grant of
      // 5; the definitive balance check is the race-safe spend below.
      senderWallet = unlimitedInvites ? null : await readFilmWallet(supabase, senderId, filmId)
      unlimitedQuota = unlimitedInvites || senderWallet?.unlimited === true

      if (!unlimitedQuota && Math.max(0, senderWallet?.balance ?? 5) <= 0) {
        console.warn('No tickets remaining for sender:', senderId, filmId)
        return res.status(400).json({ error: NO_TICKETS_MESSAGE })
      }
    }

    // Parent from explicit client claim (validated in Phase 1)
    /** Chain: this invite continues from the invite where the sender was the recipient (e.g. Vidya → Julia → Super). */
    let parentInviteId =
      claimedParent && uuidStringEq(claimedParent.film_id, filmId) ? claimedParent.id : null

    // CANONICAL GRAPH MODEL: the filmmaker and team members are roots — their invites NEVER
    // carry a parent. Without this, the watch-session fallback below could attach a stale
    // parent when e.g. the filmmaker opened someone's invite link while signed in, which made
    // their direct invitees render under a phantom intermediate node in the network graph.
    if (unlimitedInvites) parentInviteId = null

    // ── Phase 3: decrement + parent fallbacks in parallel ─────────────────
    // Fallbacks only run when the client claim didn't resolve a parent.
    // Decrement runs alongside them — it doesn't depend on the fallback results.
    const needsDecrement = Boolean(senderId && !unlimitedQuota)
    const needsFallbacks = !parentInviteId && !unlimitedInvites

    if (needsDecrement || needsFallbacks) {
      // Email candidates for fallback 1 — reuse sender.email from Phase 1, no extra query
      const candidates = new Set()
      if (needsFallbacks) {
        if (senderEmail && String(senderEmail).trim()) candidates.add(normalizeEmail(senderEmail))
        if (sender?.email) candidates.add(normalizeEmail(sender.email))
      }

      const [
        spendResult,
        { data: fb1 },
        { data: fb2 },
        { data: fb3a },
      ] = await Promise.all([
        needsDecrement
          ? spendFilmTicket(supabase, senderId, filmId)
          : Promise.resolve({ ok: true }),
        // Fallback 1: push email filter to Postgres (.in) instead of fetching 200 rows and filtering in JS
        needsFallbacks && candidates.size > 0
          ? supabase.from('invites').select('id').eq('film_id', filmId).in('recipient_email', [...candidates]).order('created_at', { ascending: true }).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        // Fallback 2: prior invite sent by this sender_id (catches email-mismatch sign-ups)
        needsFallbacks && senderId
          ? supabase.from('invites').select('parent_invite_id').eq('film_id', filmId).eq('sender_id', senderId).not('parent_invite_id', 'is', null).order('created_at', { ascending: true }).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        // Fallback 3a: watch session — if a token is found, one more query follows below
        needsFallbacks && senderId
          ? supabase.from('watch_sessions').select('invite_token').eq('viewer_id', senderId).eq('film_id', filmId).not('invite_token', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      if (needsDecrement) {
        if (!spendResult.ok) {
          return res.status(400).json({ error: spendResult.reason })
        }
        walletSpent = true
      }

      if (needsFallbacks) {
        parentInviteId = fb1?.id || fb2?.parent_invite_id || null

        // Fallback 3b: resolve watch-session token into an invite id (sequential within this branch)
        if (!parentInviteId && fb3a?.invite_token) {
          const { data: invByToken } = await supabase
            .from('invites')
            .select('id, film_id')
            .eq('token', fb3a.invite_token)
            .maybeSingle()
          if (invByToken && uuidStringEq(invByToken.film_id, filmId)) {
            parentInviteId = invByToken.id
          }
        }
      }
    }

    // ── Phase 4: insert ────────────────────────────────────────────────────
    const token = generateToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + getFilmInviteExpiryDays())

    const { error: inviteError } = await supabase
      .from('invites')
      .insert({
        film_id: filmId,
        sender_id: senderId || null,
        sender_name: senderName || null,
        sender_email: senderEmail || null,
        recipient_email: recipientEmailNorm,
        recipient_name: recipientName || null,
        recipient_last_name: recipientLastName,
        personal_note: personalNote || null,
        token,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        parent_invite_id: parentInviteId,
      })

    if (inviteError) {
      if (walletSpent && senderId) {
        await refundFilmTicket(supabase, senderId, filmId).catch((e) =>
          console.error('Failed to refund film ticket:', e?.message || e)
        )
      }
      throw inviteError
    }

    // ── Phase 5: send the email, then respond with the truth ──────────────
    // The email is awaited BEFORE we answer: success means Resend confirmed
    // acceptance of this recipient's email. On failure the invite row and the
    // allocation are rolled back and the client gets an error, so the
    // recipient stays in the form and a retry isn't blocked by the
    // "already invited" duplicate check.
    const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
    const senderFirst = sender?.name?.trim().split(/\s+/)[0] || ''
    // Greeting uses the dedicated first-name field exactly as entered (e.g. "Min Hye",
    // "Mary-Jane") — never split. Fall back to the legacy full-name split only if the
    // client didn't send a first name.
    const recipientFirstName =
      typeof recipientFirstNameInput === 'string' && recipientFirstNameInput.trim()
        ? recipientFirstNameInput.trim()
        : recipientName
          ? recipientName.trim().split(/\s+/)[0]
          : null
    const ctx = encryptInviteCtx(senderFirst, recipientFirstName || '')
    const inviteUrl = ctx ? `${baseUrl}/i/${token}?ctx=${ctx}` : `${baseUrl}/i/${token}`

    console.log(`Invite created: token=${token}, recipient=${recipientEmailNorm}, inviteUrl=${inviteUrl}`)

    // Count was fetched before insert; +1 accounts for the invite just created
    const inviteOrdinal = preInsertCount != null ? preInsertCount + 1 : null
    const displaySender = senderName || 'Someone'
    const displaySenderEmail = senderEmail || null

    const filmGifUrl = buildFilmGifUrl(film, filmId)

    const emailPayload = withFilmInviteMailingHeaders(
      withReplyTo(
        {
          from: `${displaySender} <${FROM_ADDRESS}>`,
          to: recipientEmailNorm,
          subject: formatInviteEmailSubject(displaySender),
          html: buildInviteEmailHtml({
            senderName: displaySender,
            recipientName: recipientFirstName,
            filmTitle: film.title,
            filmId,
            filmDescription: film.description,
            filmGifUrl,
            inviteUrl,
            senderEmail: displaySenderEmail,
            inviteOrdinal,
            personalNote: personalNote || null,
          }),
          text: buildInviteEmailPlainText(
            displaySender, recipientFirstName, film.title, film.description,
            film.thumbnail_url, inviteUrl, displaySenderEmail, inviteOrdinal, personalNote || null
          ),
        },
        displaySenderEmail
      ),
      inviteUrl
    )

    try {
      const accepted = await deliverEmail(emailPayload)
      res.json({ success: true, token, emailId: accepted?.id || null })
    } catch (emailErr) {
      console.error(
        `[invite/send] email failed after retries — rolling back invite\n` +
        `  token: ${token}\n  to: ${recipientEmailNorm}\n  error: ${emailErr?.message || emailErr}`
      )
      // Undo everything this request created so a retry starts clean.
      const { error: deleteErr } = await supabase.from('invites').delete().eq('token', token)
      if (deleteErr) console.error('Failed to rollback invite row:', deleteErr)
      if (walletSpent && senderId) {
        await refundFilmTicket(supabase, senderId, filmId).catch((e) =>
          console.error('Failed to refund film ticket:', e?.message || e)
        )
      }
      return res.status(502).json({
        error: `The invitation email to ${recipientEmailNorm} could not be sent. Nothing was used up — please try again.`,
      })
    }

  } catch (err) {
    console.error('Invite send error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to send invite' })
    }
  }
})

/**
 * Create a claim link (PLAN.md Step 2 / A1). No email is collected here — the
 * sharer enters only the invitee's first name and gets a link back instantly.
 * recipient_email stays NULL until the link is claimed (Step 4 / A2); the
 * film-creator share-block check therefore can't run yet either — it belongs
 * at claim time, once an email exists.
 *
 * Two sharer-identity paths (deepcast-mvp-rework.md A2 amendment, 2026-07-06):
 * a verified session takes priority when present (account-holder sharer);
 * otherwise a claimed-invite reference is required (accountless credits-end
 * sharer, C3) — that claim IS their identity, since they have no session.
 */
app.post('/api/invites/create-link', async (req, res) => {
  try {
    const {
      filmId: filmIdInput,
      inviteeFirstName: inviteeFirstNameInput,
      claimedInviteId,
      parentInviteId: clientParentInviteId,
      appUrl,
    } = req.body || {}

    const inviteeFirstName =
      typeof inviteeFirstNameInput === 'string' ? inviteeFirstNameInput.trim() : ''
    if (!inviteeFirstName) {
      return res.status(400).json({ error: "The invitee's first name is required" })
    }

    const authHeader = req.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()

    let filmId = filmIdInput
    let senderId = null
    let senderName = null
    let senderEmail = null
    let parentInviteId = null
    // Per-film wallet spend state (Piece F): whether a film ticket was spent
    // (refunded on any later failure) and the balance after the spend for
    // the response. The legacy invite wallet remains only for accountless
    // rows (claimed_by NULL).
    let walletSpent = false
    let sessionBalanceAfterSpend = null
    let accountlessTicketsRemaining = null
    let accountlessClaimId = null
    let claimedSharerBalance = null

    if (jwt) {
      // ── Account-holder sharer. Identity comes ONLY from the verified token —
      // never a client-sent sender id (same rule as /api/invites/relink). ──
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      const authUser = userData?.user
      if (userErr || !authUser?.id) return res.status(401).json({ error: 'Invalid session' })

      if (!filmId) return res.status(400).json({ error: 'Film ID is required' })

      senderId = authUser.id
      const sender = await ensureProfileForUserId(senderId)
      if (!sender) return res.status(404).json({ error: 'Sender not found' })

      const { data: film, error: filmLookupError } = await supabase
        .from('films')
        .select('id, creator_id')
        .eq('id', filmId)
        .single()
      if (filmLookupError || !film) return res.status(404).json({ error: 'Film not found' })

      const role = String(sender.role || '').trim().toLowerCase()
      const creatorOwnsFilm = uuidStringEq(film.creator_id, sender.id)
      const onCreatorTeam =
        sender.team_creator_id != null && uuidStringEq(film.creator_id, sender.team_creator_id)

      if (role === 'creator') {
        if (!creatorOwnsFilm) {
          return res.status(403).json({ error: 'You can only invite people to your own films' })
        }
      } else if (role === 'team_member' || (role === 'viewer' && sender.team_creator_id)) {
        if (!onCreatorTeam) {
          return res.status(403).json({ error: "You can only invite people to your team's films" })
        }
      }

      // Same unlimited-sender rule as /api/invites/send: role-based stays
      // GLOBAL; the flag and balance live on film_tickets (Piece F).
      const unlimitedInvites =
        role === 'creator' || role === 'team_member' || (role === 'viewer' && onCreatorTeam)
      const senderWallet = unlimitedInvites
        ? null
        : await readFilmWallet(supabase, senderId, filmId)
      const unlimitedQuota = unlimitedInvites || senderWallet?.unlimited === true

      if (!unlimitedQuota && Math.max(0, senderWallet?.balance ?? 5) <= 0) {
        return res.status(400).json({ error: NO_TICKETS_MESSAGE })
      }

      senderName = sender.name || null
      senderEmail = sender.email || null

      // Same parent-resolution rules as /api/invites/send: explicit client
      // claim first, forced null for unlimited senders, then the existing
      // fallback chain (email match → prior-sender invite → watch session).
      const { data: claimedParent } = clientParentInviteId
        ? await supabase.from('invites').select('id, film_id').eq('id', clientParentInviteId).maybeSingle()
        : { data: null }
      parentInviteId =
        claimedParent && uuidStringEq(claimedParent.film_id, filmId) ? claimedParent.id : null
      if (unlimitedInvites) parentInviteId = null

      const needsDecrement = !unlimitedQuota
      const needsFallbacks = !parentInviteId && !unlimitedInvites

      if (needsDecrement || needsFallbacks) {
        const candidates = new Set()
        if (needsFallbacks && sender.email) candidates.add(normalizeEmail(sender.email))

        const [spendResult, { data: fb1 }, { data: fb2 }, { data: fb3a }] =
          await Promise.all([
            needsDecrement
              ? spendFilmTicket(supabase, senderId, filmId)
              : Promise.resolve({ ok: true }),
            needsFallbacks && candidates.size > 0
              ? supabase.from('invites').select('id').eq('film_id', filmId).in('recipient_email', [...candidates]).order('created_at', { ascending: true }).limit(1).maybeSingle()
              : Promise.resolve({ data: null }),
            needsFallbacks
              ? supabase.from('invites').select('parent_invite_id').eq('film_id', filmId).eq('sender_id', senderId).not('parent_invite_id', 'is', null).order('created_at', { ascending: true }).limit(1).maybeSingle()
              : Promise.resolve({ data: null }),
            needsFallbacks
              ? supabase.from('watch_sessions').select('invite_token').eq('viewer_id', senderId).eq('film_id', filmId).not('invite_token', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
              : Promise.resolve({ data: null }),
          ])

        if (needsDecrement) {
          if (!spendResult.ok) {
            return res.status(400).json({ error: spendResult.reason })
          }
          walletSpent = true
          sessionBalanceAfterSpend = spendResult.next ?? null
        }

        if (needsFallbacks) {
          parentInviteId = fb1?.id || fb2?.parent_invite_id || null
          if (!parentInviteId && fb3a?.invite_token) {
            const { data: invByToken } = await supabase
              .from('invites')
              .select('id, film_id')
              .eq('token', fb3a.invite_token)
              .maybeSingle()
            if (invByToken && uuidStringEq(invByToken.film_id, filmId)) {
              parentInviteId = invByToken.id
            }
          }
        }
      }
    } else {
      // ── Accountless sharer (C3, credits-end share moment). No session
      // exists — the invite this person themselves claimed IS their identity. ──
      const claimId = typeof claimedInviteId === 'string' ? claimedInviteId.trim() : ''
      if (!claimId) {
        return res
          .status(401)
          .json({ error: 'Not authenticated, and no claimed invite reference was provided' })
      }

      const { data: claimedInvite, error: claimedLookupError } = await supabase
        .from('invites')
        .select('*')
        .eq('id', claimId)
        .maybeSingle()

      const identity = resolveAccountlessSharerIdentity(claimedLookupError ? null : claimedInvite)
      if (!identity.ok) {
        return res.status(403).json({ error: identity.reason })
      }

      filmId = identity.filmId
      parentInviteId = identity.parentInviteId
      senderName = identity.senderName
      senderEmail = identity.senderEmail

      // ── Unified wallet (Piece E), per-film since Piece F: a claimant with
      // a silent account spends film_tickets(user, THIS film), resolved
      // server-side via claimed_by — no browser session required (possession
      // of the claimed invite id remains the auth factor, unchanged). The
      // invite wallet below survives only for rows with no account. ──
      const { data: walletUser } = claimedInvite?.claimed_by
        ? await supabase
            .from('users')
            .select('id, name, email, role, team_creator_id')
            .eq('id', claimedInvite.claimed_by)
            .maybeSingle()
        : { data: null }
      const claimantFilmWallet = walletUser
        ? await readFilmWallet(supabase, walletUser.id, filmId)
        : null

      const spendPlan = claimedSharerSpendDecision(claimedInvite, walletUser, claimantFilmWallet)
      if (spendPlan.wallet === 'account') {
        // Lineage unifies too: the claimant's sends now carry their user id
        // (parent_invite_id stays their claimed invite, as always).
        senderId = spendPlan.userId
        senderName = walletUser.name || senderName
        senderEmail = walletUser.email || senderEmail
        if (!spendPlan.unlimited) {
          const spend = await spendFilmTicket(supabase, spendPlan.userId, filmId)
          if (!spend.ok) {
            return res.status(400).json({ error: spend.reason })
          }
          walletSpent = true
          claimedSharerBalance = spend.next
        }
      } else {
        // Ticket economy (2026-07-16): sharers with no account spend from
        // their claimed invite's tickets_remaining — spent at link
        // GENERATION, no refunds. Optimistic CAS with retries: the
        // conditional UPDATE only lands if the balance is still what we
        // read, so two concurrent generates can never spend the same ticket.
        // NULL balance = never initialized → healed to the initial grant.
        let spent = false
        for (let attempt = 0; attempt < 3 && !spent; attempt++) {
          const { data: fresh } =
            attempt === 0
              ? { data: claimedInvite }
              : await supabase.from('invites').select('*').eq('id', claimId).maybeSingle()
          const decision = ticketSpendDecision(fresh?.tickets_remaining)
          if (!decision.ok) {
            return res.status(400).json({ error: decision.reason })
          }
          const cas = supabase.from('invites').update({ tickets_remaining: decision.next }).eq('id', claimId)
          const { data: updated, error: spendError } =
            fresh?.tickets_remaining == null
              ? await cas.is('tickets_remaining', null).select('id').maybeSingle()
              : await cas.eq('tickets_remaining', fresh.tickets_remaining).select('id').maybeSingle()
          if (spendError) {
            if (/tickets_remaining/.test(spendError.message || '')) {
              // Pre-migration deploy: column missing — degrade to the legacy
              // no-quota behavior rather than blocking sharing.
              console.warn('[create-link] tickets_remaining column missing — no-quota fallback (apply the 20260716 migration)')
              spent = true
              break
            }
            throw spendError
          }
          if (updated) {
            spent = true
            accountlessTicketsRemaining = decision.next
            accountlessClaimId = claimId
          }
        }
        if (!spent) {
          return res.status(409).json({ error: 'Please try again — your tickets were updating.' })
        }
      }
    }

    const token = generateToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + getFilmInviteExpiryDays())

    let slug
    try {
      slug = await generateUniqueSlug(inviteeFirstName, async (candidate) => {
        const { data } = await supabase
          .from('invites')
          .select('id')
          .eq('link_slug', candidate)
          .maybeSingle()
        return Boolean(data)
      })
    } catch (slugErr) {
      if (walletSpent && senderId) {
        // A failed generation is not a spent ticket — refund (best effort).
        await refundFilmTicket(supabase, senderId, filmId).catch(() => {})
      }
      if (accountlessClaimId != null && accountlessTicketsRemaining != null) {
        // A failed generation is not a spent ticket — refund (best effort).
        await supabase.from('invites').update({ tickets_remaining: accountlessTicketsRemaining + 1 }).eq('id', accountlessClaimId)
      }
      console.error('Slug generation error:', slugErr)
      return res.status(500).json({ error: 'Could not generate a link right now — please try again' })
    }

    const { data: created, error: insertError } = await supabase
      .from('invites')
      .insert({
        film_id: filmId,
        sender_id: senderId,
        sender_name: senderName,
        sender_email: senderEmail,
        recipient_email: null,
        recipient_name: inviteeFirstName,
        token,
        status: 'created',
        expires_at: expiresAt.toISOString(),
        parent_invite_id: parentInviteId,
        link_slug: slug,
      })
      .select('id, link_slug')
      .single()

    if (insertError) {
      if (walletSpent && senderId) {
        // A failed generation is not a spent ticket — refund (best effort).
        await refundFilmTicket(supabase, senderId, filmId).catch(() => {})
      }
      if (accountlessClaimId != null && accountlessTicketsRemaining != null) {
        // A failed generation is not a spent ticket — refund (best effort).
        await supabase.from('invites').update({ tickets_remaining: accountlessTicketsRemaining + 1 }).eq('id', accountlessClaimId)
      }
      throw insertError
    }

    const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
    return res.json({
      success: true,
      slug: created.link_slug,
      url: `${baseUrl}/${created.link_slug}`,
      // Balance after this spend, per-film (Piece F): the legacy invite
      // wallet's, the stash-based claimant's, or the session sharer's film
      // balance. Null for unlimited sharers.
      ticketsRemaining:
        accountlessTicketsRemaining ?? claimedSharerBalance ?? sessionBalanceAfterSpend,
    })
  } catch (err) {
    console.error('Invite create-link error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create invite link' })
    }
  }
})

/**
 * Public lookup for the claim-link landing page (PLAN.md Step 3 / A3).
 * Slugs are guessable-by-design, so the response is deliberately minimal:
 * just what the personalized landing page renders. It never includes the
 * invite id or the legacy `token` (which would hand out a watch URL before
 * the claim step), and it does NOT transition status — viewing the landing
 * page is not "opening" in the legacy sense; the only new-flow transition
 * is the claim itself (Step 4).
 */
app.get('/api/invites/link/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase()
    if (!slug) return res.status(400).json({ error: 'Slug is required' })

    // films(*) rather than named columns so this route keeps working before
    // AND after the 20260716 transmission_hook migration is applied — naming
    // a column that doesn't exist yet would fail the whole query.
    const { data: invite, error } = await supabase
      .from('invites')
      .select('*, films(*)')
      .eq('link_slug', slug)
      .maybeSingle()

    if (error || !invite) {
      return res.status(404).json({ error: 'Invite link not found' })
    }

    // One film-scoped query powers BOTH the lineage thread and the invite
    // ordinal — an in-memory walk over ≤ a few hundred rows, cheap enough for
    // this public route (the graph surfaces already fetch the same set).
    const [{ data: filmInvites }, { data: creatorUser }, { data: claimAccount }, { data: claimFilmWallet }] = await Promise.all([
      supabase
        .from('invites')
        .select('id, parent_invite_id, sender_id, sender_name, recipient_name, recipient_email, created_at')
        .eq('film_id', invite.film_id),
      invite.films?.creator_id
        ? supabase.from('users').select('name').eq('id', invite.films.creator_id).maybeSingle()
        : Promise.resolve({ data: null }),
      // Per-film wallet (Piece F): an account-backed claim displays the
      // (person, film) balance, not the legacy invite wallet.
      invite.claimed_by
        ? supabase
            .from('users')
            .select('id, role, team_creator_id')
            .eq('id', invite.claimed_by)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      invite.claimed_by
        ? supabase
            .from('film_tickets')
            .select('user_id, film_id, balance, unlimited')
            .eq('user_id', invite.claimed_by)
            .eq('film_id', invite.film_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const rows = filmInvites || []

    // "You are the Nth person to be invited to watch this film." — this
    // invite's position by creation time (stable across page loads).
    const myCreatedAt = new Date(invite.created_at || 0).getTime()
    const inviteOrdinal = rows.filter((r) => {
      const t = new Date(r.created_at || 0).getTime()
      return t < myCreatedAt || (t === myCreatedAt && r.id <= invite.id)
    }).length || 1

    // Lineage: walk parent_invite_id from this invite up to the root. The
    // chain ends at a creator-sent or parentless invite (canonical model:
    // the filmmaker IS the root). Cycle-guarded; names resolve client-side
    // to first-name-only by the thread renderer.
    const byId = new Map(rows.map((r) => [r.id, r]))
    const creatorId = invite.films?.creator_id || null
    const isCreatorSent = (row) => creatorId && row.sender_id != null && uuidStringEq(row.sender_id, creatorId)
    const ancestors = [] // nearest (direct sharer's invite) → rootmost
    const seen = new Set([invite.id])
    let cur = invite
    while (cur.parent_invite_id && byId.has(cur.parent_invite_id) && ancestors.length < 100) {
      const parent = byId.get(cur.parent_invite_id)
      if (seen.has(parent.id)) break
      seen.add(parent.id)
      ancestors.push(parent)
      if (isCreatorSent(parent)) break
      cur = parent
    }
    const creatorName =
      (creatorUser?.name || '').trim() ||
      (rows.find((r) => isCreatorSent(r) && (r.sender_name || '').trim())?.sender_name || '').trim() ||
      (isCreatorSent(invite) ? (invite.sender_name || '').trim() : '') ||
      'The filmmaker'
    // Origin → direct sharer. For a creator-sent invite there are no
    // ancestors and the chain is just [creator] — the depth-1 case.
    const lineageNames = [
      creatorName,
      ...ancestors
        .slice()
        .reverse()
        .map((r) => r.recipient_name || r.recipient_email || 'Someone'),
    ]

    // Landing still: hand-picked films.poster_url first, else the film's
    // public Mux poster frame, else null (page falls back to the dark bg).
    const posterUrl =
      invite.films?.poster_url ||
      (invite.films?.mux_playback_id
        ? `https://image.mux.com/${invite.films.mux_playback_id}/thumbnail.jpg`
        : null)

    return res.json({
      inviteeFirstName: invite.recipient_name || null,
      sharerName: invite.sender_name || null,
      filmTitle: invite.films?.title || null,
      // Per-film C1 hook — null until the filmmaker authors one; the landing
      // page renders nothing at all for null (no box, no placeholder).
      transmissionHook: invite.films?.transmission_hook || null,
      status: invite.status,
      inviteOrdinal,
      lineageNames,
      posterUrl,
      // Watch-page needs on revisit (playback is public-policy; invites are
      // world-readable under RLS, so none of this is a new exposure class).
      muxPlaybackId: invite.films?.mux_playback_id || null,
      inviteId: invite.id,
      claimOrdinal: invite.claim_ordinal ?? null,
      ticketsRemaining: claimedInviteTicketsDisplay(invite, claimAccount, claimFilmWallet),
    })
  } catch (err) {
    console.error('Invite link lookup error:', err)
    return res.status(500).json({ error: 'Failed to look up invite link' })
  }
})

/**
 * Claim a link invite (PLAN.md Step 4 / A2 + A4). The email IS the claim
 * action — one field, no password, no account. Single-claim: the first
 * non-sharer to claim wins; the row is dead to everyone else afterward.
 *
 * The success response carries everything the post-claim beats need — the
 * graph-reveal payload (same safe column set as /api/invites/validate: no
 * tokens, no slugs, no claimed emails of others) and the film's public Mux
 * playback id for the watch beat (playback is public-policy; §1c of PLAN.md).
 */
app.post('/api/invites/claim', async (req, res) => {
  try {
    const { slug: slugInput, email: emailInput } = req.body || {}
    const slug = String(slugInput || '').trim().toLowerCase()
    if (!slug) return res.status(400).json({ error: 'Slug is required' })

    const emailNorm = normalizeEmail(emailInput)
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'Please enter a valid email address' })
    }

    const { data: invite, error: lookupError } = await supabase
      .from('invites')
      .select('id, film_id, sender_id, status, claimed_email, recipient_name, films(*)')
      .eq('link_slug', slug)
      .maybeSingle()
    if (lookupError || !invite) {
      return res.status(404).json({ error: 'Invite link not found' })
    }

    // The sharer opening (or submitting) their own link never claims it —
    // identified by their authenticated session when one is present (A2;
    // logged-out opens on the sharer's own device are an accepted MVP edge).
    const authHeader = req.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (jwt) {
      const { data: userData } = await supabase.auth.getUser(jwt)
      const authUser = userData?.user
      if (authUser?.id && invite.sender_id != null && uuidStringEq(authUser.id, invite.sender_id)) {
        return res.json({ sharerView: true })
      }
    }

    if (invite.status !== 'created' || invite.claimed_email) {
      return res.status(409).json({ error: 'This invitation has already been accepted.' })
    }

    // Standing rule (server/shareRules.js): the film never travels back to
    // its maker. Same check as /api/invites/send, applied at claim time.
    const { data: claimingUser } = await supabase
      .from('users')
      .select('id, name')
      .ilike('email', emailNorm)
      .limit(1)
      .maybeSingle()
    if (
      isShareToFilmCreator({
        recipientUserId: claimingUser?.id,
        filmCreatorId: invite.films?.creator_id,
      })
    ) {
      const creatorFirst = (claimingUser?.name || '').trim().split(/\s+/)[0] || 'You'
      return res.status(400).json({ error: `${creatorFirst} ${CREATOR_SHARE_BLOCK_REASON}` })
    }

    // Ordinal freeze: compute the invitee's position NOW and stamp it on the
    // claim — never recomputed afterward (the dashboard shows this value).
    const { data: ordinalRows } = await supabase
      .from('invites')
      .select('id, created_at')
      .eq('film_id', invite.film_id)
    const myCreated = new Date(
      (ordinalRows || []).find((r) => r.id === invite.id)?.created_at || 0
    ).getTime()
    const claimOrdinal =
      (ordinalRows || []).filter((r) => {
        const t = new Date(r.created_at || 0).getTime()
        return t < myCreated || (t === myCreated && r.id <= invite.id)
      }).length || 1

    // Atomic claim-bind: the conditional UPDATE decides the race — only one
    // concurrent claimant can match status='created' AND claimed_email IS NULL.
    // The same write stamps claim_ordinal. tickets_remaining is NOT stamped
    // anymore (Piece E): the claimant's wallet is their account's
    // invite_allocation; NULL tickets_remaining doubles as the full-grant
    // state for the accountless degradation path. Pre-migration fallback: if
    // claim_ordinal doesn't exist yet, retry the legacy claim so production
    // never breaks on a code-before-migration deploy.
    const fullClaimUpdate = {
      claimed_email: emailNorm,
      claimed_at: new Date().toISOString(),
      status: 'claimed',
      claim_ordinal: claimOrdinal,
    }
    let { data: claimedRow, error: claimError } = await supabase
      .from('invites')
      .update(fullClaimUpdate)
      .eq('id', invite.id)
      .eq('status', 'created')
      .is('claimed_email', null)
      .select('id')
      .maybeSingle()
    if (claimError && /claim_ordinal/.test(claimError.message || '')) {
      console.warn('[claim] ordinal column missing — legacy claim (apply the 20260716 migration)')
      ;({ data: claimedRow, error: claimError } = await supabase
        .from('invites')
        .update({ claimed_email: emailNorm, claimed_at: new Date().toISOString(), status: 'claimed' })
        .eq('id', invite.id)
        .eq('status', 'created')
        .is('claimed_email', null)
        .select('id')
        .maybeSingle())
    }
    if (claimError) throw claimError
    if (!claimedRow) {
      return res.status(409).json({ error: 'This invitation has already been accepted.' })
    }

    // ── Silent account (Piece E, 2026-07-17): the claim IS account creation.
    // Runs only AFTER the CAS, so a losing claimant in a race never gets an
    // account. An email that already has an account attaches (find, not
    // create — claiming is never a top-up). Any failure degrades to the
    // accountless claim exactly as before: claimed_by stays NULL and the
    // invite wallet's NULL-equals-full-grant rule takes over. Zero claim UX
    // either way — no password, no confirmation email, same response. ──
    let accountBalance = null
    try {
      const firstName = (invite.recipient_name || '').trim() || emailNorm.split('@')[0]
      const { userId, created: accountCreated } = await findOrCreatePasswordlessAccount(
        emailNorm,
        firstName,
        undefined,
        ''
      )
      await supabase.from('invites').update({ claimed_by: userId }).eq('id', invite.id)
      // Per-film wallet (Piece F): claiming THIS film initializes THIS film's
      // wallet at the standard grant — never resetting an existing row, and
      // never touching any other film's balance.
      await initFilmWallet(supabase, userId, invite.film_id)
      const [{ data: acct }, wallet] = await Promise.all([
        supabase.from('users').select('id, role, team_creator_id').eq('id', userId).maybeSingle(),
        readFilmWallet(supabase, userId, invite.film_id),
      ])
      const remaining = filmTicketsRemaining(acct, wallet)
      accountBalance = Number.isFinite(remaining) ? remaining : null
      console.log(
        `[claim] silent account ${accountCreated ? 'created' : 'attached'} for ${emailNorm} (${userId})`
      )
    } catch (acctErr) {
      console.warn(
        '[claim] silent account creation failed — accountless claim stands:',
        acctErr?.message || acctErr
      )
    }

    // Claim routes DIRECTLY to the watch page (final spec 2026-07-16) — no
    // reveal beat, so no graph payload here; the dashboard fetches its own.
    return res.json({
      success: true,
      inviteId: invite.id,
      slug,
      filmId: invite.film_id,
      claimOrdinal,
      ticketsRemaining: accountBalance ?? INITIAL_CLAIMANT_TICKETS,
      film: {
        id: invite.films?.id || invite.film_id,
        title: invite.films?.title || null,
        muxPlaybackId: invite.films?.mux_playback_id || null,
        transmissionHook: invite.films?.transmission_hook || null,
      },
    })
  } catch (err) {
    console.error('Invite claim error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to accept the invitation' })
    }
  }
})

app.post('/api/invites/resend-last', async (req, res) => {
  try {
    const { filmId, senderId, appUrl } = req.body

    if (!filmId || !senderId) {
      return res.status(400).json({ error: 'Film ID and sender ID are required' })
    }

    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('film_id', filmId)
      .eq('sender_id', senderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'No invite found to resend' })
    }

    const { data: film, error: filmError } = await supabase
      .from('films')
      .select('title, description, thumbnail_url, mux_playback_id, gif_start, gif_end')
      .eq('id', filmId)
      .single()

    if (filmError || !film) {
      return res.status(404).json({ error: 'Film not found' })
    }

    const { count: inviteCount, error: inviteCountError } = await supabase
      .from('invites')
      .select('*', { count: 'exact', head: true })
      .eq('film_id', filmId)

    if (inviteCountError) {
      console.error('Invite count error:', inviteCountError.message || inviteCountError)
    }

    const inviteOrdinal = inviteCount || null
    const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
    const displaySender = invite.sender_name || 'Someone'
    const displaySenderEmail = invite.sender_email || null
    // recipient_name is first-name-only now, so use it whole (no split) for both the email
    // greeting and the ctx. Legacy rows from before last-name removal hold a full name —
    // showing that whole on a resend is an acceptable cosmetic effect on old data.
    const recipientFirstName = invite.recipient_name
      ? invite.recipient_name.trim()
      : null
    let senderFirst = ''
    if (invite.sender_id) {
      const { data: senderProfile } = await supabase.from('users').select('name').eq('id', invite.sender_id).single()
      senderFirst = senderProfile?.name?.trim().split(/\s+/)[0] || ''
    }
    const ctx = encryptInviteCtx(senderFirst, recipientFirstName || '')
    const inviteUrl = ctx ? `${baseUrl}/i/${invite.token}?ctx=${ctx}` : `${baseUrl}/i/${invite.token}`

    try {
      const filmGifUrl = buildFilmGifUrl(film, invite.film_id)

      const htmlBody = buildInviteEmailHtml({
        senderName: displaySender,
        recipientName: recipientFirstName,
        filmTitle: film.title,
        filmId: invite.film_id,
        filmDescription: film.description,
        filmGifUrl,
        inviteUrl,
        senderEmail: displaySenderEmail,
        inviteOrdinal,
        personalNote: invite.personal_note || null,
      })
      const textBody = buildInviteEmailPlainText(
        displaySender,
        recipientFirstName,
        film.title,
        film.description,
        film.thumbnail_url,
        inviteUrl,
        displaySenderEmail,
        inviteOrdinal,
        invite.personal_note || null
      )
      await deliverEmail(
        withFilmInviteMailingHeaders(
          withReplyTo(
            {
              from: `${displaySender} <${FROM_ADDRESS}>`,
              to: invite.recipient_email,
              subject: formatInviteEmailSubject(displaySender),
              html: htmlBody,
              text: textBody,
            },
            displaySenderEmail
          ),
          inviteUrl
        )
      )
    } catch (emailErr) {
      const message = emailErr?.message || 'Email send failed'
      console.error('Invite resend-last email error:', message)
      return res.status(502).json({ error: 'Email failed to send', details: message })
    }

    res.json({ success: true, inviteId: invite.id })
  } catch (err) {
    console.error('Invite resend error:', err)
    res.status(500).json({ error: 'Failed to resend invite' })
  }
})

/**
 * Per-film replenish (Piece F, 2026-07-17): +3 tickets to a sharer each time
 * their watched count on a film reaches a multiple of 3 — the legacy
 * client-side rule (InviteScreening's checkReplenish) moved server-side,
 * where it can actually write (the old client update of another user's row
 * was RLS-dead) and where no browser ever writes wallets. The count is
 * recomputed here from invite rows; the caller only points at the pair.
 * Role-unlimited senders have nothing to replenish.
 */
app.post('/api/invites/replenish-check', async (req, res) => {
  try {
    const { senderId, filmId } = req.body || {}
    if (!senderId || !filmId) {
      return res.status(400).json({ error: 'senderId and filmId are required' })
    }
    const { data: sender } = await supabase
      .from('users')
      .select('id, role, team_creator_id')
      .eq('id', senderId)
      .maybeSingle()
    if (!sender || isRoleUnlimitedSharer(sender)) return res.json({ replenished: false })

    const { count } = await supabase
      .from('invites')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', senderId)
      .eq('film_id', filmId)
      .eq('status', 'watched')
    if (!count || count % 3 !== 0) return res.json({ replenished: false })

    const next = await grantFilmTickets(supabase, senderId, filmId, 3)
    console.log(`[replenish] +3 film tickets for ${senderId} on ${filmId} (watched ${count}) → ${next}`)
    return res.json({ replenished: true })
  } catch (err) {
    console.error('replenish-check error:', err)
    return res.status(500).json({ error: 'Could not check replenish' })
  }
})

app.post('/api/invites/resend', async (req, res) => {
  try {
    const { inviteId, appUrl } = req.body

    if (!inviteId) {
      return res.status(400).json({ error: 'Invite ID is required' })
    }

    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('id', inviteId)
      .single()

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Invite not found' })
    }

    const { data: film, error: filmError } = await supabase
      .from('films')
      .select('title, description, thumbnail_url, mux_playback_id, gif_start, gif_end')
      .eq('id', invite.film_id)
      .single()

    if (filmError || !film) {
      return res.status(404).json({ error: 'Film not found' })
    }

    const { count: inviteCount, error: inviteCountError } = await supabase
      .from('invites')
      .select('*', { count: 'exact', head: true })
      .eq('film_id', invite.film_id)

    if (inviteCountError) {
      console.error('Invite count error:', inviteCountError.message || inviteCountError)
    }

    const inviteOrdinal = inviteCount || null
    const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
    const displaySender = invite.sender_name || 'Someone'
    const displaySenderEmail = invite.sender_email || null
    // recipient_name is first-name-only now, so use it whole (no split) for both the email
    // greeting and the ctx. Legacy rows from before last-name removal hold a full name —
    // showing that whole on a resend is an acceptable cosmetic effect on old data.
    const recipientFirstName = invite.recipient_name
      ? invite.recipient_name.trim()
      : null
    let senderFirst = ''
    if (invite.sender_id) {
      const { data: senderProfile } = await supabase.from('users').select('name').eq('id', invite.sender_id).single()
      senderFirst = senderProfile?.name?.trim().split(/\s+/)[0] || ''
    }
    const ctx = encryptInviteCtx(senderFirst, recipientFirstName || '')
    const inviteUrl = ctx ? `${baseUrl}/i/${invite.token}?ctx=${ctx}` : `${baseUrl}/i/${invite.token}`

    try {
      const filmGifUrl = buildFilmGifUrl(film, invite.film_id)

      const htmlBody = buildInviteEmailHtml({
        senderName: displaySender,
        recipientName: recipientFirstName,
        filmTitle: film.title,
        filmId: invite.film_id,
        filmDescription: film.description,
        filmGifUrl,
        inviteUrl,
        senderEmail: displaySenderEmail,
        inviteOrdinal,
        personalNote: invite.personal_note || null,
      })
      const textBody = buildInviteEmailPlainText(
        displaySender,
        recipientFirstName,
        film.title,
        film.description,
        film.thumbnail_url,
        inviteUrl,
        displaySenderEmail,
        inviteOrdinal,
        invite.personal_note || null
      )
      await deliverEmail(
        withFilmInviteMailingHeaders(
          withReplyTo(
            {
              from: `${displaySender} <${FROM_ADDRESS}>`,
              to: invite.recipient_email,
              subject: formatInviteEmailSubject(displaySender),
              html: htmlBody,
              text: textBody,
            },
            displaySenderEmail
          ),
          inviteUrl
        )
      )
    } catch (emailErr) {
      const message = emailErr?.message || 'Email send failed'
      console.error('Invite resend-by-id email error:', message)
      return res.status(502).json({ error: 'Email failed to send', details: message })
    }

    res.json({ success: true, inviteId: invite.id })
  } catch (err) {
    console.error('Invite resend error:', err)
    res.status(500).json({ error: 'Failed to resend invite' })
  }
})

// ============ TEAM MEMBER INVITES (creators → teammates, unlimited film invites) ============

function buildTeamInviteEmailHtml(creatorName, joinUrl) {
  const c = escapeHtml(creatorName || 'Your filmmaker')
  const u = escapeHtml(joinUrl)
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;background-color:#f5f5f0;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background:#fff;padding:32px 28px;">
<tr><td>
<p style="margin:0 0 16px;">Hi,</p>
<p style="margin:0 0 16px;">${c} invited you to join their team on <span style="font-weight:600;">Deepcast</span>. Create your password to access the dashboard and send screening invitations on their behalf.</p>
<p style="margin:24px 0;"><a href="${u}" style="color:#5C4F3A;font-weight:500;">Complete registration</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#888;">Or paste this link:<br/>${u}</p>
<p style="margin:24px 0 0;font-size:13px;color:#888;">— <span style="font-weight:600;">Deepcast</span></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

function buildTeamInviteEmailPlainText(creatorName, joinUrl) {
  const n = creatorName || 'Your filmmaker'
  return `Hi,\n\n${n} invited you to join their team on Deepcast. Create your password to access the dashboard and send screening invitations on their behalf.\n\nComplete registration:\n${joinUrl}\n\n— Deepcast\n`
}

function buildTeamAddedEmailHtml(creatorName, loginUrl) {
  const c = escapeHtml(creatorName || 'Your filmmaker')
  const u = escapeHtml(loginUrl)
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;background-color:#f5f5f0;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background:#fff;padding:32px 28px;">
<tr><td>
<p style="margin:0 0 16px;">Hi,</p>
<p style="margin:0 0 16px;">${c} added you to their team on <span style="font-weight:600;">Deepcast</span>. You now have unlimited screening invites for their films. Sign in with your existing password.</p>
<p style="margin:24px 0;"><a href="${u}" style="color:#5C4F3A;font-weight:500;">Sign in</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#888;">Or paste this link:<br/>${u}</p>
<p style="margin:24px 0 0;font-size:13px;color:#888;">— <span style="font-weight:600;">Deepcast</span></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

function buildTeamAddedEmailPlainText(creatorName, loginUrl) {
  const n = creatorName || 'Your filmmaker'
  return `Hi,\n\n${n} added you to their Deepcast team. You now have unlimited screening invites for their films. Sign in with your existing password.\n\nSign in:\n${loginUrl}\n\n— Deepcast\n`
}

app.post('/api/team/send-invite', async (req, res) => {
  try {
    const { creatorId, inviteeEmail, inviteeName, appUrl } = req.body
    if (!creatorId || !inviteeEmail) {
      return res.status(400).json({ error: 'Creator ID and invitee email are required' })
    }

    const emailNorm = normalizeEmail(inviteeEmail)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'Invalid email address' })
    }

    const { data: creator, error: cErr } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', creatorId)
      .single()

    if (cErr || !creator || String(creator.role || '').trim().toLowerCase() !== 'creator') {
      return res.status(403).json({ error: 'Only creators can invite teammates' })
    }

    if (normalizeEmail(creator.email) === emailNorm) {
      return res.status(400).json({ error: 'You cannot invite your own email' })
    }

    let existingProfile = null
    {
      const { data: directRow } = await supabase
        .from('users')
        .select('id, role, team_creator_id')
        .eq('email', emailNorm)
        .maybeSingle()
      existingProfile = directRow || null

      if (!existingProfile) {
        const { data: fallbackRow } = await supabase
          .from('users')
          .select('id, role, team_creator_id')
          .ilike('email', emailNorm)
          .maybeSingle()
        existingProfile = fallbackRow || null
      }

      // Auth account exists but no public.users row — create it and treat as existing viewer
      if (!existingProfile) {
        try {
          const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
          const authUser = authList?.users?.find(
            (u) => normalizeEmail(u.email) === emailNorm
          )
          if (authUser) {
            const safeName = emailNorm.split('@')[0] || 'Member'
            const { data: created } = await supabase
              .from('users')
              .upsert(
                {
                  id: authUser.id,
                  email: emailNorm,
                  name: safeName,
                  first_name: safeName,
                  last_name: '',
                  role: 'viewer',
                  invite_allocation: 5,
                },
                { onConflict: 'id', ignoreDuplicates: false }
              )
              .select('id, role, team_creator_id')
              .maybeSingle()
            existingProfile = created || { id: authUser.id, role: 'viewer', team_creator_id: null }
          }
        } catch (adminErr) {
          console.warn('auth.admin.listUsers fallback failed:', adminErr?.message)
        }
      }
    }

    if (existingProfile) {
      if (existingProfile.role === 'team_member' && existingProfile.team_creator_id === creatorId) {
        return res.status(400).json({ error: 'This person is already on your team' })
      }
      if (existingProfile.role === 'team_member' && existingProfile.team_creator_id !== creatorId) {
        return res.status(400).json({
          error: "This person is already on another filmmaker's team.",
        })
      }
      if (existingProfile.role === 'viewer') {
        if (
          existingProfile.team_creator_id != null &&
          !uuidStringEq(existingProfile.team_creator_id, creatorId)
        ) {
          return res.status(400).json({
            error: "This viewer is already linked to another filmmaker's team.",
          })
        }

        // Update failures surface through the empty-rows check + RPC fallback below.
        const { data: upRows } = await supabase
          .from('users')
          .update({
            role: 'team_member',
            team_creator_id: creatorId,
            invite_allocation: 0,
          })
          .eq('id', existingProfile.id)
          .select('id')

        let upgraded = Boolean(upRows?.length)

        if (!upgraded) {
          const { data: rpcOk, error: rpcUpErr } = await supabase.rpc(
            'upgrade_viewer_to_team_member_for_creator',
            { p_creator_id: creatorId, p_email: emailNorm }
          )
          if (rpcUpErr) {
            console.error('team send-invite viewer upgrade rpc:', rpcUpErr)
            return res.status(500).json({ error: 'Failed to add teammate' })
          }
          upgraded = Boolean(rpcOk)
        }

        if (!upgraded) {
          return res.status(500).json({
            error: 'Failed to add teammate',
            details:
              'Database did not apply the update. Apply migration 20260328_team_invite_rpcs.sql or set SUPABASE_SERVICE_ROLE_KEY.',
          })
        }

        await supabase
          .from('team_invites')
          .delete()
          .eq('creator_id', creatorId)
          .eq('email', emailNorm)
          .is('accepted_at', null)

        const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
        const loginUrl = `${baseUrl}/login`

        try {
          await deliverEmail(
            withReplyTo(
              {
                to: emailNorm,
                subject: `${creator.name || 'Your filmmaker'} added you to their Deepcast team`,
                html: buildTeamAddedEmailHtml(creator.name, loginUrl),
                text: buildTeamAddedEmailPlainText(creator.name, loginUrl),
              },
              creator.email
            )
          )
        } catch (emailErr) {
          const message = emailErr?.message || 'Email send failed'
          console.error('Team added (viewer) email error:', message)
          return res.status(502).json({ error: 'Email failed to send', details: message })
        }

        return res.json({ success: true, upgradedFromViewer: true })
      }
      return res.status(400).json({
        error: 'An account already exists with this email. They can sign in at the login page.',
      })
    }

    await supabase
      .from('team_invites')
      .delete()
      .eq('creator_id', creatorId)
      .eq('email', emailNorm)
      .is('accepted_at', null)

    const token = generateTeamInviteToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14)

    const invitedName =
      typeof inviteeName === 'string' && inviteeName.trim() ? inviteeName.trim() : null

    const { data: insertedRows, error: insErr } = await supabase
      .from('team_invites')
      .insert({
        creator_id: creatorId,
        email: emailNorm,
        invited_name: invitedName,
        token,
        expires_at: expiresAt.toISOString(),
      })
      .select('token, expires_at')

    let inviteToken = insertedRows?.[0]?.token

    if (insErr || !inviteToken) {
      if (insErr) {
        console.warn('team_invites insert (trying RPC fallback):', insErr.message || insErr)
      }
      const { data: rpcRows, error: rpcErr } = await supabase.rpc(
        'create_team_invite_for_creator',
        {
          p_creator_id: creatorId,
          p_email: emailNorm,
          p_invited_name: invitedName || '',
        }
      )
      if (rpcErr || !rpcRows?.length) {
        console.error('create_team_invite_for_creator:', rpcErr)
        return res.status(500).json({
          error: 'Failed to create team invite',
          details:
            rpcErr?.message ||
            (insErr?.message ?? 'Apply migration 20260328_team_invite_rpcs.sql or set SUPABASE_SERVICE_ROLE_KEY.'),
        })
      }
      inviteToken = rpcRows[0].token
    }

    const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
    const joinUrl = `${baseUrl}/team/join?token=${encodeURIComponent(inviteToken)}`

    try {
      await deliverEmail(
        withReplyTo(
          {
            to: emailNorm,
            subject: `${creator.name || 'Your filmmaker'} invited you to the Deepcast team`,
            html: buildTeamInviteEmailHtml(creator.name, joinUrl),
            text: buildTeamInviteEmailPlainText(creator.name, joinUrl),
          },
          creator.email
        )
      )
    } catch (emailErr) {
      const message = emailErr?.message || 'Email send failed'
      console.error('Team invite email error:', message)
      await supabase.from('team_invites').delete().eq('token', inviteToken)
      return res.status(502).json({ error: 'Email failed to send', details: message })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Team send-invite error:', err)
    res.status(500).json({ error: 'Failed to send team invite' })
  }
})

app.get('/api/team/invite-info', async (req, res) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : ''
    if (!token) return res.status(400).json({ error: 'Token is required' })

    const { data: invRows, error } = await supabase
      .from('team_invites')
      .select('id, email, invited_name, expires_at, accepted_at, creator_id')
      .eq('token', token)
      .limit(1)
    if (error) {
      console.error('team invite-info query:', error)
      return res.status(500).json({ error: 'Failed to load invitation' })
    }
    const row = invRows?.[0]
    if (row) {
      const { data: creatorRow } = await supabase
        .from('users')
        .select('name')
        .eq('id', row.creator_id)
        .maybeSingle()
      row.creator_name = creatorRow?.name || null
    }
    if (!row) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (row.accepted_at) {
      return res.status(410).json({ error: 'This invitation was already used' })
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This invitation has expired' })
    }

    res.json({
      email: row.email,
      invitedName: row.invited_name || '',
      creatorName: row.creator_name || 'Your filmmaker',
    })
  } catch (err) {
    console.error('team invite-info error:', err)
    res.status(500).json({ error: 'Failed to load invitation' })
  }
})

app.post('/api/team/register', async (req, res) => {
  try {
    const { token, password, fullName } = req.body
    const t = typeof token === 'string' ? token.trim() : ''
    if (!t || !password) {
      return res.status(400).json({ error: 'Token and password are required' })
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    if (supabaseKeyRole !== 'service_role') {
      return res.status(503).json({
        error: 'Team signup is not fully configured on this server',
        details:
          'Add SUPABASE_SERVICE_ROLE_KEY to the API environment. Invite emails are sent, but creating the teammate account requires the Supabase service role key.',
      })
    }

    const { data: invRows, error: rowErr } = await supabase
      .from('team_invites')
      .select('id, email, invited_name, expires_at, accepted_at, creator_id')
      .eq('token', t)
      .limit(1)
    if (rowErr) {
      console.error('team register invite lookup:', rowErr)
      return res.status(500).json({ error: 'Failed to load invitation' })
    }
    const row = invRows?.[0]
    if (!row) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (row.accepted_at) {
      return res.status(410).json({ error: 'This invitation was already used' })
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This invitation has expired' })
    }

    const emailNorm = normalizeEmail(row.email)

    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('email', emailNorm)
      .maybeSingle()

    if (existingProfile) {
      return res.status(409).json({ error: 'An account already exists with this email' })
    }

    const nameFromInvite =
      typeof row.invited_name === 'string' && row.invited_name.trim()
        ? row.invited_name.trim()
        : emailNorm.split('@')[0]
    const displayName =
      typeof fullName === 'string' && fullName.trim() ? fullName.trim() : nameFromInvite
    // Names are first-name-only now — store the whole name as first_name; don't split off a
    // last name. (Existing accounts are unaffected; nothing user-facing reads first_name.)
    const firstName = displayName
    const lastName = ''

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: emailNorm,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: displayName },
    })

    if (authErr || !authData?.user?.id) {
      const msg = authErr?.message || 'Could not create account'
      if (/already|registered|exists/i.test(msg)) {
        return res.status(409).json({ error: 'An account already exists with this email' })
      }
      console.error('auth.admin.createUser:', authErr)
      return res.status(500).json({ error: msg })
    }

    const userId = authData.user.id

    const { error: profileErr } = await supabase.from('users').insert({
      id: userId,
      email: emailNorm,
      name: displayName,
      first_name: firstName,
      last_name: lastName,
      role: 'team_member',
      team_creator_id: row.creator_id,
      invite_allocation: 0,
    })

    if (profileErr) {
      console.error('team register users insert:', profileErr)
      await supabase.auth.admin.deleteUser(userId)
      return res.status(500).json({ error: 'Failed to create profile' })
    }

    const { data: acceptedRows, error: acceptErr } = await supabase
      .from('team_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('token', t)
      .is('accepted_at', null)
      .select('id')
    if (acceptErr || !acceptedRows?.length) {
      console.error('accept team invite:', acceptErr, acceptedRows)
      await supabase.auth.admin.deleteUser(userId).catch(() => {})
      return res.status(500).json({ error: 'Failed to finalize invitation' })
    }

    res.json({ success: true, userId })
  } catch (err) {
    console.error('team register error:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

/** Find an auth user by email via the admin API (small scale; paginates defensively). */
async function findAuthUserByEmail(emailNorm) {
  let page = 1
  for (;;) {
    const { data: list, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      console.error('findAuthUserByEmail listUsers:', error)
      return null
    }
    const found = (list?.users || []).find((u) => normalizeEmail(u.email) === emailNorm)
    if (found) return found
    if (!list?.users?.length || list.users.length < 1000) return null
    page += 1
  }
}

/**
 * Invite-gated account creation for the Seal & Send / pass-it-on flow.
 *
 * Security invariant: an account can ONLY ever be created for an email that was genuinely
 * invited. The account email is derived server-side from invite.recipient_email (looked up by
 * the unguessable token) — the client cannot assert an arbitrary email. Existing accounts are
 * never modified beyond confirming the email; passwords are never overwritten (no takeover).
 *
 * Creates the auth user (email pre-confirmed) and the profile row using the service role, so
 * the client can immediately signInWithPassword and obtain a persisted session.
 */
app.post('/api/invites/claim-account', async (req, res) => {
  try {
    const { token, password, name } = req.body || {}
    const t = typeof token === 'string' ? token.trim() : ''
    if (!t) return res.status(400).json({ error: 'Invite token is required' })
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    if (supabaseKeyRole !== 'service_role') {
      return res.status(503).json({
        error: 'Account creation is not fully configured on this server',
        details:
          'Add SUPABASE_SERVICE_ROLE_KEY to the API environment. Creating the account requires the Supabase service role key.',
      })
    }

    // 1) The token is the capability: look up the invite and derive the email from it.
    //    The client-supplied email (if any) is intentionally ignored.
    const { data: invite, error: invErr } = await supabase
      .from('invites')
      .select('id, recipient_email, recipient_name, recipient_last_name')
      .eq('token', t)
      .maybeSingle()
    if (invErr) {
      console.error('claim-account invite lookup:', invErr)
      return res.status(500).json({ error: 'Failed to load invitation' })
    }
    if (!invite) return res.status(404).json({ error: 'Invitation not found' })

    const emailNorm = normalizeEmail(invite.recipient_email)
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(422).json({ error: 'This invitation has no valid recipient email' })
    }

    const displayName =
      typeof name === 'string' && name.trim()
        ? name.trim()
        : invite.recipient_name && invite.recipient_name.trim()
          ? invite.recipient_name.trim()
          : emailNorm.split('@')[0]
    // displayName is the first name (users.name stays first-name only). The invite's last name,
    // when present, carries into the new account's last_name so it holds the full name.
    const firstName = displayName
    const lastName =
      (invite.recipient_last_name && invite.recipient_last_name.trim()) || ''

    // 2) Find-or-create the auth user for the invited email.
    const existingAuthUser = await findAuthUserByEmail(emailNorm)
    let userId
    let created = false

    if (existingAuthUser) {
      userId = existingAuthUser.id
      // Confirm if needed, but NEVER change an existing account's password.
      if (!existingAuthUser.email_confirmed_at) {
        await supabase.auth.admin.updateUserById(userId, { email_confirm: true })
      }
    } else {
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: emailNorm,
        password: String(password),
        email_confirm: true,
        user_metadata: { full_name: displayName },
      })
      if (authErr || !authData?.user?.id) {
        const msg = authErr?.message || 'Could not create account'
        if (/already|registered|exists/i.test(msg)) {
          // Raced with another create — return conflict so the client signs in instead.
          return res.status(409).json({ error: 'An account already exists for this email', email: emailNorm })
        }
        console.error('claim-account createUser:', authErr)
        return res.status(500).json({ error: msg })
      }
      userId = authData.user.id
      created = true
    }

    // 3) Ensure a profile row exists — insert only if missing, so we never clobber an
    //    existing profile's role/allocation.
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (!existingProfile) {
      const { error: profileErr } = await supabase.from('users').insert({
        id: userId,
        email: emailNorm,
        name: displayName,
        first_name: firstName,
        last_name: lastName,
        role: 'viewer',
        invite_allocation: 5,
      })
      if (profileErr) {
        console.error('claim-account profile insert:', profileErr)
        return res.status(500).json({ error: 'Failed to create profile' })
      }
    }

    res.json({ success: true, userId, email: emailNorm, created })
  } catch (err) {
    console.error('claim-account error:', err)
    res.status(500).json({ error: 'Account creation failed' })
  }
})

/* ================================================================== */
/*  PASSWORDLESS INVITE-FIRST SIGN-IN                                 */
/* ================================================================== */

/**
 * RELINK: point the opened invite (looked up by token) at the chosen account email so the
 * dashboard "received" query and isInviteRecipientSession both match the account going forward.
 *
 * R5 guard: never create a duplicate (film_id, recipient_email). If another invite for the same
 * film already holds this email, we skip the overwrite — the account is still linked to the film
 * via that pre-existing invite through the email match. Only the opened invite is ever relinked
 * (siblings to the original email are intentionally left untouched).
 *
 * @returns {{ relinked: boolean, openedInvite: object|null }}
 */
async function relinkOpenedInvite(token, emailNorm) {
  const { data: opened, error } = await supabase
    .from('invites')
    .select('id, film_id, recipient_email')
    .eq('token', token)
    .maybeSingle()
  if (error || !opened) return { relinked: false, reason: 'invite-not-found', openedInvite: null }

  if (normalizeEmail(opened.recipient_email) === emailNorm) {
    // Opened invite already points at this account — nothing to do, already linked.
    return { relinked: false, reason: 'already-current', openedInvite: opened }
  }

  const { data: clash } = await supabase
    .from('invites')
    .select('id')
    .eq('film_id', opened.film_id)
    .neq('id', opened.id)
    .ilike('recipient_email', emailNorm)
    .limit(1)
    .maybeSingle()
  if (clash) {
    // R5 guard: this account already holds a different invite for the same film, so it is already
    // linked (the dashboard "received" query matches by email). Skipping avoids a duplicate
    // (film_id, recipient_email) — this is a benign, explicit no-op, not an unlinked state.
    console.warn(
      `relink: ${emailNorm} already linked to film ${opened.film_id} via invite ${clash.id}; leaving opened invite ${opened.id} as-is`
    )
    return { relinked: false, reason: 'already-linked-via-sibling', openedInvite: opened }
  }

  const { error: updErr } = await supabase
    .from('invites')
    .update({ recipient_email: emailNorm })
    .eq('id', opened.id)
  if (updErr) {
    console.error('relinkOpenedInvite update:', updErr)
    return { relinked: false, reason: 'update-failed', openedInvite: opened }
  }
  return { relinked: true, reason: 'relinked', openedInvite: { ...opened, recipient_email: emailNorm } }
}

/**
 * Replicate the email-keyed linkage that the old password signUp did (auth.jsx:317-327), so
 * sent/received attribution still works now that the viewer flow no longer calls signUp:
 *  - invites this person received (recipient_email) that were already watched → signed_up
 *  - invites this person sent under this email (sender_email) but with no sender_id → stamp it
 *  - stamp watch_sessions for any tokens opened on this email with the new viewer_id
 */
async function replicateInviteLinkage(userId, emailNorm, displayName, openedToken) {
  await Promise.all([
    supabase
      .from('invites')
      .update({ status: 'signed_up' })
      .ilike('recipient_email', emailNorm)
      .eq('status', 'watched'),
    supabase
      .from('invites')
      .update({ sender_id: userId, sender_name: displayName, sender_email: emailNorm })
      .ilike('sender_email', emailNorm)
      .is('sender_id', null),
    openedToken
      ? supabase
          .from('watch_sessions')
          .update({ viewer_id: userId })
          .eq('invite_token', openedToken)
          .is('viewer_id', null)
      : Promise.resolve(),
  ]).catch((err) => console.warn('replicateInviteLinkage:', err?.message || err))
}

/**
 * Find-or-create the public.users profile for an existing auth user id. Used to self-heal the
 * profile-before-session race (a valid session that briefly has no profile row). Returns the row,
 * or null if there is no auth user behind the id.
 */
async function ensureProfileForUserId(userId) {
  const { data: existing } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()
  if (existing) return existing

  const { data: authData } = await supabase.auth.admin.getUserById(userId)
  const authUser = authData?.user
  if (!authUser?.email) return null

  const emailNorm = normalizeEmail(authUser.email)
  const displayName = (authUser.user_metadata?.full_name || '').trim() || emailNorm.split('@')[0]
  const { data: created, error } = await supabase
    .from('users')
    .insert({
      id: userId,
      email: emailNorm,
      name: displayName,
      // Names are first-name-only now — store the whole name; don't split off a last name.
      first_name: displayName,
      last_name: '',
      role: 'viewer',
      invite_allocation: 5,
    })
    .select()
    .single()
  if (error) {
    // Lost a race with a concurrent insert — re-read.
    const { data: again } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()
    return again || null
  }
  return created
}

/**
 * Create (passwordless) or find the auth user + profile for an invited email.
 * Returns { userId, created } — `created` is true only when THIS call created the auth user, so the
 * caller knows whether it's safe to roll the user back on a later failure.
 */
async function findOrCreatePasswordlessAccount(emailNorm, displayName, precheckedAuthUser, lastNameInput = '') {
  // displayName is the first name (users.name stays first-name only). The last name, when the
  // invite carried one, is stored in its own column so the account holds the full name.
  const firstName = displayName
  const lastName = typeof lastNameInput === 'string' ? lastNameInput.trim() : ''

  // `precheckedAuthUser` lets a caller that already ran findAuthUserByEmail (an admin scan of
  // every auth user) pass its result in — undefined means "not checked, look it up here".
  // createUser still guards the create race via its own already-exists error.
  const existing =
    precheckedAuthUser !== undefined ? precheckedAuthUser : await findAuthUserByEmail(emailNorm)
  let userId
  let created = false
  if (existing) {
    userId = existing.id
    if (!existing.email_confirmed_at) {
      await supabase.auth.admin.updateUserById(userId, { email_confirm: true })
    }
  } else {
    // No password — this is a passwordless account. email_confirm so no Supabase confirm email fires.
    const { data, error } = await supabase.auth.admin.createUser({
      email: emailNorm,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    })
    if (error || !data?.user?.id) {
      const msg = error?.message || 'Could not create account'
      const e = new Error(msg)
      e.alreadyExists = /already|registered|exists/i.test(msg)
      throw e
    }
    userId = data.user.id
    created = true
  }

  const { data: profile } = await supabase.from('users').select('id').eq('id', userId).maybeSingle()
  if (!profile) {
    const { error: profErr } = await supabase.from('users').insert({
      id: userId,
      email: emailNorm,
      name: displayName,
      first_name: firstName,
      last_name: lastName,
      role: 'viewer',
      invite_allocation: 5,
    })
    if (profErr) {
      // Don't leave an orphaned auth user (no profile) — it would poison retries by tripping the
      // existing-account guard. Roll back only the user WE created.
      if (created) await supabase.auth.admin.deleteUser(userId).catch(() => {})
      throw new Error('Failed to create profile')
    }
  }
  return { userId, created }
}

/** Branded one-tap sign-in email (matches the invite email aesthetic — NOT Supabase's default sender). */
function buildSignInEmailHtml(actionLink, contextLine) {
  const safe = escapeHtml(actionLink)
  const intro = escapeHtml(
    contextLine || 'Tap below to sign in to Deepcast. This link is single-use and expires shortly.'
  )
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0c1220;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#0c1220;">
<tr><td align="center" style="padding:0;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background-color:#0c1220;">
<tr><td align="center" style="padding:56px 40px 8px;">
  <img src="https://wmtjgpxhjtbocsmutqqc.supabase.co/storage/v1/object/public/film-assets/deepcast-logo-cropped.png" width="200" alt="deepcast" style="display:block;border:0;margin:0 auto;" />
</td></tr>
<tr><td align="center" style="padding:24px 40px 8px;">
  <p style="margin:0;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#6b7fa3;font-family:system-ui,-apple-system,sans-serif;">SIGN IN TO DEEPCAST</p>
</td></tr>
<tr><td style="padding:16px 40px 28px;">
  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#c8d0dc;text-align:center;">${intro}</p>
</td></tr>
<tr><td align="center" style="padding:0 40px 40px;">
  <table cellpadding="0" cellspacing="0" role="presentation">
    <tr><td style="background-color:#b8a06a;border-radius:2px;">
      <a href="${safe}" style="display:inline-block;padding:18px 48px;font-family:system-ui,-apple-system,sans-serif;font-weight:700;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#0c1220;text-decoration:none;">SIGN IN</a>
    </td></tr>
  </table>
</td></tr>
<tr><td align="center" style="padding:0 40px 32px;">
  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b7fa3;text-align:center;">If you didn’t request this, you can safely ignore this email.</p>
</td></tr>
<tr><td align="center" style="padding:8px 40px 40px;">
  <p style="margin:0;font-size:10px;color:#2a3a5a;letter-spacing:2px;font-family:system-ui,-apple-system,sans-serif;">© deepcast — MVP v1.0</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

/** Generate a Supabase magic link (admin, no email sent) and deliver it via Resend. */
async function sendSignInLinkEmail(emailNorm, redirectTo, contextLine) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: emailNorm,
    options: redirectTo ? { redirectTo } : undefined,
  })
  if (error || !data?.properties?.action_link) {
    throw new Error(error?.message || 'Could not generate sign-in link')
  }
  await deliverEmail({
    to: emailNorm,
    subject: 'Your Deepcast sign-in link',
    html: buildSignInEmailHtml(data.properties.action_link, contextLine),
    text: `Sign in to Deepcast:\n${data.properties.action_link}\n\nThis link is single-use and expires shortly. If you didn't request it, ignore this email.`,
  })
}

/**
 * Invite-first passwordless session.
 *  - No existing account → create passwordless account, RELINK opened invite, mint session IN-BAND
 *    (return hashed_token; client calls verifyOtp). No email sent.
 *  - Existing account → DO NOT mint a session. Email a one-tap sign-in link (Resend) that returns
 *    to this invitation, and tell the client to show "check your inbox".
 */
app.post('/api/invites/session', async (req, res) => {
  try {
    const { token, email, appUrl } = req.body || {}
    const t = typeof token === 'string' ? token.trim() : ''
    const emailNorm = normalizeEmail(email)
    if (!t) return res.status(400).json({ error: 'Invite token is required' })
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'A valid email is required' })
    }
    if (supabaseKeyRole !== 'service_role') {
      return res.status(503).json({
        error: 'Sign-in is not fully configured on this server',
        details: 'Add SUPABASE_SERVICE_ROLE_KEY to the API environment.',
      })
    }

    // Invite lookup and the existing-account scan are independent — run them together.
    const [{ data: invite, error: invErr }, existingAuthUser] = await Promise.all([
      supabase.from('invites').select('id, recipient_name, recipient_last_name, recipient_email').eq('token', t).maybeSingle(),
      // EXISTING-ACCOUNT GUARD: never mint a session without an inbox round-trip.
      findAuthUserByEmail(emailNorm),
    ])
    if (invErr) return res.status(500).json({ error: 'Failed to load invitation' })
    if (!invite) return res.status(404).json({ error: 'Invitation not found' })

    // Name follows the invite record, not the typed email. First name → displayName/users.name;
    // the invite's last name (when present) carries into the new account's last_name.
    const displayName =
      (invite.recipient_name && invite.recipient_name.trim()) || emailNorm.split('@')[0]
    const recipientLastName =
      (invite.recipient_last_name && invite.recipient_last_name.trim()) || ''
    if (existingAuthUser) {
      const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
      const redirectTo = `${baseUrl}/i/${encodeURIComponent(t)}`
      await sendSignInLinkEmail(
        emailNorm,
        redirectTo,
        'Tap below to sign in and open your invitation. This link is single-use and expires shortly.'
      )
      return res.json({ status: 'existing', emailed: true })
    }

    // NEW ACCOUNT: create passwordless, relink, replicate linkage, mint session in-band.
    let userId
    let created
    try {
      // The guard above already scanned for this email and found nothing — pass that result
      // through (null) so the helper doesn't repeat the full-account-list scan.
      ({ userId, created } = await findOrCreatePasswordlessAccount(emailNorm, displayName, existingAuthUser, recipientLastName))
    } catch (err) {
      if (err.alreadyExists) {
        // Raced with a create — fall back to the email round-trip rather than minting.
        const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
        await sendSignInLinkEmail(emailNorm, `${baseUrl}/i/${encodeURIComponent(t)}`)
        return res.json({ status: 'existing', emailed: true })
      }
      console.error('invites/session create:', err)
      return res.status(500).json({ error: err.message || 'Could not create account' })
    }

    // Finalize atomically: relink + linkage + session. If ANY step fails, roll back the auth user
    // we just created so the next attempt re-enters cleanly in-band instead of being shunted to the
    // existing-account email path. (Relinking the invite's recipient_email is idempotent and harmless
    // to leave; the orphaned auth user is the only thing that poisons retries.)
    try {
      // The three finalize steps are independent (relink + linkage touch different invite
      // columns; generateLink only needs the auth user), so they run in parallel. Rollback
      // semantics are unchanged: relink/replicate swallow their own errors, and a generateLink
      // failure still rejects this block and rolls back the freshly created user below.
      const [, , { data: linkData, error: linkErr }] = await Promise.all([
        relinkOpenedInvite(t, emailNorm),
        replicateInviteLinkage(userId, emailNorm, displayName, t),
        // In-band session: generateLink (no redirectTo needed — client verifies the hash directly).
        supabase.auth.admin.generateLink({ type: 'magiclink', email: emailNorm }),
      ])
      if (linkErr || !linkData?.properties?.hashed_token) {
        throw new Error(linkErr?.message || 'Could not generate session link')
      }

      return res.json({
        status: 'created',
        userId,
        email: emailNorm,
        tokenHash: linkData.properties.hashed_token,
      })
    } catch (finalizeErr) {
      if (created) {
        await supabase.from('users').delete().eq('id', userId).catch(() => {})
        await supabase.auth.admin.deleteUser(userId).catch(() => {})
      }
      console.error('invites/session finalize:', finalizeErr)
      return res.status(500).json({ error: 'Could not establish session' })
    }
  } catch (err) {
    console.error('invites/session error:', err)
    return res.status(500).json({ error: 'Sign-in failed' })
  }
})

/**
 * RELINK for an already-signed-in user opening an invite (case 1). Authenticated via the caller's
 * bearer token — the email is resolved from the verified session, never asserted by the client.
 */
app.post('/api/invites/relink', async (req, res) => {
  try {
    const { token } = req.body || {}
    const t = typeof token === 'string' ? token.trim() : ''
    if (!t) return res.status(400).json({ error: 'Invite token is required' })

    const authHeader = req.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return res.status(401).json({ error: 'Not authenticated' })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    const authUser = userData?.user
    if (userErr || !authUser?.email) return res.status(401).json({ error: 'Invalid session' })

    const emailNorm = normalizeEmail(authUser.email)

    // Guarantee a profile exists for this session before the user can act (share). This closes the
    // magic-link profile-before-session race that produced "Unable to verify invites".
    const profile = await ensureProfileForUserId(authUser.id)

    const { relinked, reason } = await relinkOpenedInvite(t, emailNorm)
    const displayName = authUser.user_metadata?.full_name || emailNorm.split('@')[0]
    await replicateInviteLinkage(authUser.id, emailNorm, displayName, t)

    return res.json({ success: true, relinked, reason, profileReady: Boolean(profile) })
  } catch (err) {
    console.error('invites/relink error:', err)
    return res.status(500).json({ error: 'Relink failed' })
  }
})

/* ============ OWNER-ONLY ADMIN: ticket controls ============ */

/**
 * Verify the caller is THE owner account (server/adminAuth.js): cryptographic
 * session verification, then an exact user-ID match against ADMIN_USER_ID.
 * Never trusts IDs from the request body. Sends the error response itself and
 * returns null when the caller is not authorized.
 */
async function requireAdminCaller(req, res) {
  const authHeader = req.get('authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) {
    res.status(401).json({ error: 'Not authenticated' })
    return null
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
  const authUser = userData?.user
  if (userErr || !authUser?.id) {
    res.status(401).json({ error: 'Invalid session' })
    return null
  }
  const { data: callerProfile } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', authUser.id)
    .maybeSingle()
  const decision = adminAuthDecision({
    adminUserId: process.env.ADMIN_USER_ID,
    callerId: authUser.id,
    callerRole: callerProfile?.role,
  })
  if (!decision.ok) {
    res.status(decision.status).json({ error: decision.error })
    return null
  }
  return authUser
}

/**
 * Ticket controls (Piece B, 2026-07-17): top-ups and unlimited for ANY person
 * in the film's network, targeted by USER ID (claimed_by / sender lineage) —
 * never by legacy email matching. Same owner pin as every admin route.
 *
 * The batched status route is also how the admin table shows REAL balances
 * for every row: client RLS can't read other users' wallets, so the numbers
 * come from here (this retires the tickets-left em dash for account rows).
 */
const SELECT_TICKET_TARGET = 'id, name, email, role, team_creator_id, unlimited_shares, invite_allocation'

/** One person's wallet as the admin table displays it. */
function ticketControlStatus(u) {
  const remaining = invitationsRemaining(u)
  const probe = ticketControlTargetDecision({ targetUser: u, action: 'grant', amount: 1 })
  return {
    name: u.name || null,
    email: u.email || null,
    role: u.role || null,
    unlimited: !Number.isFinite(remaining),
    ticketsLeft: Number.isFinite(remaining) ? remaining : null,
    controllable: Boolean(probe.applied),
    reason: probe.applied ? null : probe.reason || null,
  }
}

app.post('/api/admin/ticket-controls/status', async (req, res) => {
  try {
    const caller = await requireAdminCaller(req, res)
    if (!caller) return

    const userIds = Array.isArray(req.body?.userIds)
      ? [...new Set(req.body.userIds.map((v) => String(v || '').trim()).filter(Boolean))].slice(0, 200)
      : []
    if (!userIds.length) return res.json({ statuses: {} })

    const { data: rows, error } = await supabase
      .from('users')
      .select(SELECT_TICKET_TARGET)
      .in('id', userIds)
    if (error) throw error

    const statuses = {}
    for (const u of rows || []) statuses[u.id] = ticketControlStatus(u)
    return res.json({ statuses })
  } catch (err) {
    console.error('admin ticket-controls status error:', err)
    return res.status(500).json({ error: 'Could not load ticket statuses' })
  }
})

app.post('/api/admin/ticket-controls', async (req, res) => {
  try {
    const caller = await requireAdminCaller(req, res)
    if (!caller) return

    const { userId, action, amount, unlimited } = req.body || {}
    const targetId = String(userId || '').trim()
    if (!targetId) return res.status(400).json({ error: 'A target user id is required' })

    const { data: targetUser } = await supabase
      .from('users')
      .select(SELECT_TICKET_TARGET)
      .eq('id', targetId)
      .maybeSingle()

    const decision = ticketControlTargetDecision({ targetUser, action, amount, unlimited })
    if (!decision.ok) return res.status(decision.status).json({ error: decision.error })
    if (!decision.applied) {
      // Graceful refusal ("No account yet" / "Already unlimited") — state the
      // UI displays quietly, not an error.
      return res.json({ applied: false, reason: decision.reason })
    }

    if (decision.action === 'grant') {
      // CAS with retries: concurrent grants can never lose an increment.
      let landed = false
      for (let attempt = 0; attempt < 3 && !landed; attempt++) {
        const { data: fresh } =
          attempt === 0
            ? { data: targetUser }
            : await supabase.from('users').select('invite_allocation').eq('id', targetId).maybeSingle()
        const current = fresh?.invite_allocation
        const next = Math.max(0, current ?? 0) + decision.amount
        const cas = supabase.from('users').update({ invite_allocation: next }).eq('id', targetId)
        const { data: row, error: casErr } =
          current == null
            ? await cas.is('invite_allocation', null).select('id').maybeSingle()
            : await cas.eq('invite_allocation', current).select('id').maybeSingle()
        if (casErr) throw casErr
        if (row) landed = true
      }
      if (!landed) {
        return res.status(409).json({ error: 'Please try again — the balance was updating.' })
      }
    } else {
      const { error: flagErr } = await supabase
        .from('users')
        .update({ unlimited_shares: decision.unlimited })
        .eq('id', targetId)
      if (flagErr) throw flagErr
    }

    // Fresh state back so the cell updates live without a refetch.
    const { data: after } = await supabase
      .from('users')
      .select(SELECT_TICKET_TARGET)
      .eq('id', targetId)
      .maybeSingle()
    if (!after) return res.status(500).json({ error: 'Could not reload the account' })
    return res.json({ applied: true, ...ticketControlStatus(after) })
  } catch (err) {
    console.error('admin ticket-controls error:', err)
    return res.status(500).json({ error: 'Could not update tickets' })
  }
})

/**
 * Delete-with-splice (Piece C, 2026-07-17): remove a TEST person from a
 * film's network; their claimed children re-point to the target's own
 * parent (the chain splices around the deleted node). Engine and ordering
 * in server/deleteSplice.js; refusals in server/deleteRules.js — evaluated
 * independently by BOTH routes (execute never trusts a preview). Unclaimed
 * links delete by invite id (no splice — a dead end has no children).
 */
async function resolveDeleteRequest(req, res, caller) {
  const { filmId, email, inviteId } = req.body || {}
  if (!filmId) {
    res.status(400).json({ error: 'A film id is required' })
    return null
  }

  if (inviteId) {
    const { data: invite } = await supabase
      .from('invites')
      .select('id, film_id, status, recipient_name, claimed_email, claimed_by, link_slug')
      .eq('id', String(inviteId).trim())
      .maybeSingle()
    const decision = deleteTicketTargetDecision({ invite, filmId })
    if (!decision.ok) {
      res.status(decision.status).json({ error: decision.error })
      return null
    }
    return { kind: 'ticket', invite }
  }

  const { plan, targetUser, ownsAnyFilm } = await buildDeletePlan(supabase, { filmId, email })
  const decision = deletePersonTargetDecision({
    email,
    targetUser,
    ownsAnyFilm,
    callerId: caller.id,
    hasAnyRows: plan.hasAnyRows,
  })
  if (!decision.ok) {
    res.status(decision.status).json({ error: decision.error })
    return null
  }
  return { kind: 'person', plan }
}

app.post('/api/admin/delete-person/preview', async (req, res) => {
  try {
    const caller = await requireAdminCaller(req, res)
    if (!caller) return
    const resolved = await resolveDeleteRequest(req, res, caller)
    if (!resolved) return

    if (resolved.kind === 'ticket') {
      return res.json({
        kind: 'ticket',
        name: resolved.invite.recipient_name || 'invite',
        slug: resolved.invite.link_slug || null,
        summary: `This deletes the unclaimed link for ${resolved.invite.recipient_name || 'this invite'}. Nothing else is touched.`,
      })
    }

    const { plan } = resolved
    return res.json({
      kind: 'person',
      email: plan.email,
      name: plan.targetName,
      repoint: plan.repoint.map((r) => ({ child: r.childName, toParentId: r.toParentId })),
      inviteCount: plan.deleteInvites.length,
      watchSessionCount: plan.watchSessionIds.length,
      accountDeleted: plan.deleteAccount,
      accountKeptReason: plan.accountKeptReason,
    })
  } catch (err) {
    console.error('admin delete preview error:', err)
    return res.status(500).json({ error: 'Could not build the preview' })
  }
})

app.post('/api/admin/delete-person', async (req, res) => {
  try {
    const caller = await requireAdminCaller(req, res)
    if (!caller) return
    // Every refusal re-verified from scratch — never trusts the preview.
    const resolved = await resolveDeleteRequest(req, res, caller)
    if (!resolved) return

    if (resolved.kind === 'ticket') {
      const { error } = await supabase.from('invites').delete().eq('id', resolved.invite.id)
      if (error) throw error
      console.log(`[admin] deleted unclaimed link ${resolved.invite.link_slug || resolved.invite.id}`)
      return res.json({ deleted: true, kind: 'ticket' })
    }

    const confirm = deleteConfirmDecision({
      email: req.body?.email,
      confirmEmail: req.body?.confirmEmail,
    })
    if (!confirm.ok) return res.status(confirm.status).json({ error: confirm.error })

    const result = await executeDeletePlan(supabase, resolved.plan)
    console.log(
      `[admin] delete-with-splice ${resolved.plan.email}: repointed ${result.repointed}, ` +
        `invites ${result.invitesDeleted}, sessions ${result.watchSessionsDeleted}, account ${result.accountDeleted}`
    )
    return res.json({ deleted: true, kind: 'person', ...result })
  } catch (err) {
    console.error('admin delete error:', err)
    return res.status(500).json({ error: 'Could not complete the deletion' })
  }
})

/**
 * Bare-site / re-auth sign-in link (no invite token). Emails a one-tap link that lands on the
 * dashboard. Always responds 200 (does not reveal whether an account exists) but only sends when
 * an account is present.
 */
app.post('/api/auth/signin-link', async (req, res) => {
  try {
    const { email, appUrl, redirectPath } = req.body || {}
    const emailNorm = normalizeEmail(email)
    if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'A valid email is required' })
    }
    if (supabaseKeyRole !== 'service_role') {
      return res.status(503).json({ error: 'Sign-in is not fully configured on this server' })
    }

    const existing = await findAuthUserByEmail(emailNorm)
    if (existing) {
      const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
      const path = typeof redirectPath === 'string' && redirectPath.startsWith('/') ? redirectPath : '/dashboard'
      await sendSignInLinkEmail(emailNorm, `${baseUrl}${path}`)
    }
    // Uniform response regardless of existence.
    return res.json({ ok: true })
  } catch (err) {
    console.error('auth/signin-link error:', err)
    return res.status(500).json({ error: 'Could not send sign-in link' })
  }
})

app.post('/api/team/remove-member', async (req, res) => {
  try {
    // Verified-session pattern (same as /api/invites/relink and the admin endpoints):
    // the creator's identity comes ONLY from the verified token — a client-sent
    // creatorId is no longer accepted or read.
    const authHeader = req.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return res.status(401).json({ error: 'Not authenticated' })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    const authUser = userData?.user
    if (userErr || !authUser?.id) return res.status(401).json({ error: 'Invalid session' })
    const creatorId = authUser.id

    const { memberId } = req.body || {}

    const [{ data: caller }, { data: member }] = await Promise.all([
      supabase.from('users').select('id, role').eq('id', creatorId).maybeSingle(),
      memberId
        ? supabase.from('users').select('id, role, team_creator_id').eq('id', memberId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const decision = removeTeammateDecision({
      callerId: creatorId,
      callerRole: caller?.role,
      memberId,
      member,
    })
    if (!decision.ok) return res.status(decision.status).json({ error: decision.error })

    const { data: updatedRows, error: upErr } = await supabase
      .from('users')
      .update({
        role: 'viewer',
        team_creator_id: null,
        invite_allocation: 5,
      })
      .eq('id', memberId)
      .select('id')

    if (upErr) {
      console.error('team remove-member update:', upErr)
      return res.status(500).json({ error: 'Failed to remove teammate' })
    }

    let removed = Boolean(updatedRows?.length)

    if (!removed) {
      const { data: rpcOk, error: rpcErr } = await supabase.rpc(
        'remove_team_member_for_creator',
        { p_creator_id: creatorId, p_member_id: memberId }
      )
      if (rpcErr) {
        console.error('team remove-member rpc:', rpcErr)
        return res.status(500).json({
          error: 'Failed to remove teammate',
          details: rpcErr.message || String(rpcErr),
        })
      }
      removed = Boolean(rpcOk)
    }

    if (!removed) {
      return res.status(500).json({
        error: 'Failed to remove teammate',
        details:
          'Database did not apply the update. Set SUPABASE_SERVICE_ROLE_KEY on the API server, or run the migration that creates remove_team_member_for_creator().',
      })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('team remove-member error:', err)
    res.status(500).json({ error: 'Failed to remove teammate' })
  }
})

app.get('/api/invites/validate/:token', async (req, res) => {
  try {
    const { token } = req.params
    if (!token) return res.status(400).json({ error: 'Token is required' })

    const { data: inv, error } = await supabase
      .from('invites')
      .select('*, films(*)')
      .eq('token', token)
      .single()

    if (error || !isInviteUsable(inv)) {
      return res.status(404).json({ error: 'Invite not found' })
    }

    // All five follow-ups depend only on the invite row already loaded, so they run in parallel —
    // one round-trip to Supabase instead of five sequential ones (the API and DB are in different
    // regions, so each sequential query costs a full cross-region round trip).
    const [
      ,
      { data: session, error: sessionError },
      { data: senderUser },
      { data: filmInvites, error: invitesError },
      { data: creatorUser },
      { data: teamMemberRows },
    ] = await Promise.all([
      inv.status === 'pending'
        ? supabase.from('invites').update({ status: 'opened' }).eq('id', inv.id)
        : Promise.resolve({}),
      supabase
        .from('watch_sessions')
        .insert({ film_id: inv.film_id, invite_token: token })
        .select()
        .single(),
      /** Sender name must come exclusively from the sender's live profile — never from stale invite fields or email. */
      inv.sender_id
        ? supabase.from('users').select('name').eq('id', inv.sender_id).single()
        : Promise.resolve({ data: null }),
      /** All invites for this film — used by the viewer's network map. Service role bypasses RLS. */
      supabase
        .from('invites')
        .select('id, film_id, sender_id, sender_name, sender_email, recipient_name, recipient_email, status, created_at, parent_invite_id')
        .eq('film_id', inv.film_id)
        .order('created_at', { ascending: true }),
      /** Creator name for the network map root label. */
      inv.films?.creator_id
        ? supabase.from('users').select('name').eq('id', inv.films.creator_id).single()
        : Promise.resolve({ data: null }),
      /** Team members (unlimited-share users) — the graph renders them as their own nodes. */
      inv.films?.creator_id
        ? supabase.from('users').select('id').eq('team_creator_id', inv.films.creator_id)
        : Promise.resolve({ data: null }),
    ])

    if (sessionError) {
      console.error('Watch session create error:', sessionError.message || sessionError)
    }

    if (invitesError) {
      console.error('validate: filmInvites load error', invitesError.message || invitesError)
    }

    const senderDisplayName = senderUser?.name?.trim() || null
    const creatorName = creatorUser?.name?.trim() || ''

    return res.json({
      invite: inv,
      film: inv.films,
      sessionId: session?.id || null,
      senderDisplayName,
      filmInvites: filmInvites || [],
      creatorName,
      creatorId: inv.films?.creator_id || null,
      teamMemberIds: (teamMemberRows || []).map((u) => u.id),
    })
  } catch (err) {
    console.error('Invite validate error:', err)
    return res.status(500).json({ error: 'Failed to validate invite' })
  }
})

// ============ EMAIL TEMPLATE ============

function escapeHtml(s) {
  if (s == null || s === '') return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** English ordinal: 1st, 2nd, 3rd, 11th, 21st, … */
function ordinalSuffix(n) {
  const num = Number(n)
  if (!Number.isFinite(num) || num < 1) return String(n)
  const j = num % 10
  const k = num % 100
  if (j === 1 && k !== 11) return `${num}st`
  if (j === 2 && k !== 12) return `${num}nd`
  if (j === 3 && k !== 13) return `${num}rd`
  return `${num}th`
}

/** Subject: "[First name] [Last name] has shared a film with you" (uses full sender name when provided). */
function formatInviteEmailSubject(senderName) {
  const parts = String(senderName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const display = parts.length ? parts.join(' ') : 'Someone'
  return `${display} has gifted you a film`
}

function buildInviteEmailPlainText(
  senderName,
  recipientName,
  filmTitle,
  filmDescription,
  filmThumbnailUrl,
  inviteUrl,
  senderEmail,
  inviteOrdinal,
  personalNote
) {
  let body = `deepcast — A PRIVATE SCREENING INVITATION\n`
  body += `Gifted by ${senderName || 'Someone'}\n\n`
  if (personalNote && String(personalNote).trim()) {
    body += `${String(personalNote).trim()}\n\n`
  }
  if (filmTitle) body += `${filmTitle}\n`
  if (filmDescription && String(filmDescription).trim()) body += `${String(filmDescription).trim()}\n`
  if (filmTitle || filmDescription) body += '\n'
  body += `Accept your invitation:\n${inviteUrl}\n\n`
  if (inviteOrdinal) {
    body += `You are the ${ordinalSuffix(inviteOrdinal)} person invited to this private screening.\n\n`
  }
  body += `© deepcast — MVP v1.0\n`
  return body
}

function buildInviteEmailHtml({
  senderName,
  recipientName,
  filmTitle,
  filmId,
  filmDescription,
  filmGifUrl,
  inviteUrl,
  inviteOrdinal,
  personalNote,
}) {
  const safe = {
    senderDisplay: escapeHtml(senderName || 'Someone'),
    senderUpper: escapeHtml((senderName || 'Someone').toUpperCase()),
    recipientName: escapeHtml(recipientName || ''),
    // `recipientName` is already the first name passed by the caller — don't split it
    // again, or multi-word first names like "Min Hye" would be truncated to "Min".
    recipientFirstName: escapeHtml(recipientName || ''),
    filmTitle: escapeHtml(filmTitle || ''),
    filmDescription: escapeHtml(filmDescription || ''),
    personalNote: personalNote ? escapeHtml(String(personalNote).trim()) : '',
    inviteUrl: escapeHtml(inviteUrl),
    filmGifUrl: filmGifUrl ? escapeHtml(filmGifUrl) : null,
  }

  // A Sacred Pause only: italicize the title and any "A Sacred Pause" in the synopsis.
  // Applied to the ALREADY-ESCAPED strings by wrapping in <i>…</i> we control — the data
  // is never unescaped and no data-supplied HTML is ever allowed through.
  const isSacredPause = filmId === SACRED_PAUSE_FILM_ID
  const filmTitleHtml = isSacredPause ? `<i>${safe.filmTitle}</i>` : safe.filmTitle
  const filmDescriptionHtml = isSacredPause
    ? safe.filmDescription.replace(/A Sacred Pause/g, '<i>A Sacred Pause</i>')
    : safe.filmDescription

  const gifBlock = safe.filmGifUrl
    ? `<tr><td align="center" style="padding:16px 0;">
      <a href="${safe.inviteUrl}" style="display:block;text-decoration:none;width:520px;margin:0 auto;">
        <img src="${safe.filmGifUrl}" width="520" alt="${safe.filmTitle}" style="display:block;width:520px;border:0;" />
      </a>
    </td></tr>`
    : ''

  const noteBlock = safe.personalNote
    ? `<tr><td style="padding:16px 40px 32px;">
        <p style="margin:0 0 10px;font-size:10px;letter-spacing:3px;color:#6b7fa3;font-family:system-ui,-apple-system,sans-serif;">A PERSONAL NOTE FROM ${safe.senderUpper}</p>
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-style:normal;font-size:16px;line-height:1.7;color:#e8e4dc;">${safe.personalNote.replace(/\n/g, '<br/>')}</p>
      </td></tr>`
    : ''

  const curatorSentence = `${safe.senderDisplay} has thoughtfully curated and shared a short film with you.${
    inviteOrdinal ? ` You are the ${ordinalSuffix(inviteOrdinal)} person to be invited to this private screening.` : ''
  }`

  const greetingBlock = safe.recipientName
    ? `<tr><td style="padding:24px 40px 0;">
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:#c8d0dc;">Dear ${safe.recipientName},</p>
      </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0c1220;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${curatorSentence}</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#0c1220;">
<tr><td align="center" style="padding:0;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background-color:#0c1220;">

<tr><td align="center" style="padding:56px 40px 8px;">
  <img src="https://wmtjgpxhjtbocsmutqqc.supabase.co/storage/v1/object/public/film-assets/deepcast-logo-cropped.png" width="220" alt="deepcast" style="display:block;border:0;margin:0 auto;" />
</td></tr>

<tr><td align="center" style="padding:0 40px 24px;">
  <p style="margin:0;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#6b7fa3;font-family:system-ui,-apple-system,sans-serif;">A PRIVATE FILM SCREENING FOR ${safe.recipientFirstName}</p>
  <p style="margin:8px 0 0;font-size:10px;letter-spacing:3px;color:#6b7fa3;font-family:system-ui,-apple-system,sans-serif;">GIFTED BY ${safe.senderUpper}</p>
</td></tr>

${greetingBlock}

<tr><td style="padding:16px 40px 24px;">
  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#c8d0dc;">${curatorSentence}</p>
</td></tr>

${noteBlock}

<tr><td style="padding:0 40px 12px;">
  <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-weight:700;font-size:15px;letter-spacing:2px;text-transform:uppercase;color:#ffffff;">${filmTitleHtml}</p>
</td></tr>

${gifBlock}

<tr><td style="padding:0 40px 32px;">
  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#8a9bb8;">${filmDescriptionHtml}</p>
</td></tr>

<tr><td align="center" style="padding:0 40px 40px;">
  <table cellpadding="0" cellspacing="0" role="presentation">
    <tr><td style="background-color:#b8a06a;border-radius:2px;">
      <a href="${safe.inviteUrl}" style="display:inline-block;padding:18px 48px;font-family:system-ui,-apple-system,sans-serif;font-weight:700;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#0c1220;text-decoration:none;">ACCEPT YOUR INVITATION</a>
    </td></tr>
  </table>
</td></tr>

<tr><td align="center" style="padding:24px 40px;">
  <p style="margin:0;font-size:10px;color:#2a3a5a;letter-spacing:2px;font-family:system-ui,-apple-system,sans-serif;">© deepcast — MVP v1.0</p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

// ============ START SERVER ============

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Deepcast API server running on port ${PORT}`)
})
