import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Mux from '@mux/mux-node'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { ensureHttpsUrl } from '../src/lib/httpsUrl.js'

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

/** Liveness for deploy pipelines and smoke tests — no DB or external services. */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'deepcast-api',
    timestamp: new Date().toISOString(),
  })
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
  return crypto.randomBytes(4).toString('hex') // 8 char hex string
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

app.post('/api/invites/send', async (req, res) => {
  try {
    const {
      filmId,
      recipientEmail,
      recipientName,
      senderName,
      senderId,
      senderEmail,
      personalNote,
      appUrl,
    } = req.body

    if (!filmId || !recipientEmail) {
      return res.status(400).json({ error: 'Film ID and recipient email are required' })
    }

    const recipientEmailNorm = normalizeEmail(recipientEmail)
    if (!recipientEmailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmailNorm)) {
      return res.status(400).json({ error: 'Invalid recipient email address' })
    }
    let previousAllocation = null
    let allocationDecremented = false

    const { data: film, error: filmLookupError } = await supabase
      .from('films')
      .select('title, description, thumbnail_url, creator_id')
      .eq('id', filmId)
      .single()

    if (filmLookupError || !film) {
      return res.status(404).json({ error: 'Film not found' })
    }

    // Check sender allocation + film access (creators / team only for their films)
    if (senderId) {
      const { data: sender, error: senderError } = await supabase
        .from('users')
        .select('invite_allocation, role, team_creator_id, id')
        .eq('id', senderId)
        .single()

      if (senderError) {
        console.error('Invite allocation lookup error:', senderError.message || senderError)
        return res.status(500).json({ error: 'Unable to verify invites' })
      }

      if (!sender) {
        return res.status(404).json({ error: 'Sender not found' })
      }

      const role = String(sender.role || '')
        .trim()
        .toLowerCase()
      const creatorOwnsFilm = uuidStringEq(film.creator_id, sender.id)
      const onCreatorTeam =
        sender.team_creator_id != null &&
        uuidStringEq(film.creator_id, sender.team_creator_id)

      if (role === 'creator') {
        if (!creatorOwnsFilm) {
          return res.status(403).json({ error: 'You can only invite people to your own films' })
        }
      } else if (role === 'team_member' || (role === 'viewer' && sender.team_creator_id)) {
        if (!onCreatorTeam) {
          return res.status(403).json({ error: 'You can only invite people to your team’s films' })
        }
      }

      /* Teammates use invite_allocation 0 + unlimited; stale role "viewer" with team_creator_id must not hit "No invites remaining". */
      const unlimitedInvites =
        role === 'creator' ||
        role === 'team_member' ||
        (role === 'viewer' && onCreatorTeam)

      if (!unlimitedInvites && sender.invite_allocation <= 0) {
        console.warn('No invites remaining for sender:', senderId, sender)
        return res.status(400).json({
          error: 'No invites remaining',
          details: { senderId, invite_allocation: sender.invite_allocation },
        })
      }

      if (!unlimitedInvites) {
        previousAllocation = sender.invite_allocation
        const { error: decrementError } = await supabase
          .from('users')
          .update({ invite_allocation: sender.invite_allocation - 1 })
          .eq('id', senderId)

        if (decrementError) {
          console.error('Invite allocation decrement error:', decrementError.message || decrementError)
          return res.status(500).json({ error: 'Unable to update invites' })
        }
        allocationDecremented = true
      }
    }

    /** Chain: this invite continues from the invite where the sender was the recipient (e.g. Vidya → Julia → Super). */
    let parentInviteId = null
    if (senderEmail && String(senderEmail).trim()) {
      const se = String(senderEmail).trim().toLowerCase()
      const { data: priorInvites } = await supabase
        .from('invites')
        .select('id, recipient_email')
        .eq('film_id', filmId)
        .order('created_at', { ascending: false })
        .limit(200)
      const match = (priorInvites || []).find(
        (row) => row.recipient_email && row.recipient_email.trim().toLowerCase() === se
      )
      if (match) parentInviteId = match.id
    }

    // Create invite
    const token = generateToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .insert({
        film_id: filmId,
        sender_id: senderId || null,
        sender_name: senderName || null,
        sender_email: senderEmail || null,
        recipient_email: recipientEmailNorm,
        recipient_name: recipientName || null,
        personal_note: personalNote || null,
        token,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        parent_invite_id: parentInviteId,
      })
      .select()
      .single()

    if (inviteError) throw inviteError

    // Count invites for film to include in email
    const { count: inviteCount, error: inviteCountError } = await supabase
      .from('invites')
      .select('*', { count: 'exact', head: true })
      .eq('film_id', filmId)

    if (inviteCountError) {
      console.error('Invite count error:', inviteCountError.message || inviteCountError)
    }

    const inviteOrdinal = inviteCount || null

    // Send email via Resend
    const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
    const senderFirst = senderName ? senderName.trim().split(/\s+/)[0] : ''
    const recipientFirstName = recipientName ? recipientName.trim().split(/\s+/)[0] : null
    const ctx = encryptInviteCtx(senderFirst, recipientFirstName || '')
    const inviteUrl = ctx ? `${baseUrl}/i/${token}?ctx=${ctx}` : `${baseUrl}/i/${token}`
    const displaySender = senderName || 'Someone'
    const displaySenderEmail = senderEmail || null

    try {
      const htmlBody = buildInviteEmailHtml(
        displaySender,
        recipientFirstName,
        film.title,
        film.description,
        film.thumbnail_url,
        inviteUrl,
        displaySenderEmail,
        inviteOrdinal,
        personalNote || null
      )
      const textBody = buildInviteEmailPlainText(
        displaySender,
        recipientFirstName,
        film.title,
        film.description,
        film.thumbnail_url,
        inviteUrl,
        displaySenderEmail,
        inviteOrdinal,
        personalNote || null
      )
      await sendInviteEmailResend(
        withFilmInviteMailingHeaders(
          withReplyTo(
            {
              to: recipientEmailNorm,
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
      console.error('Email send error:', message, emailErr)
      await supabase.from('invites').delete().eq('id', invite.id)
      if (allocationDecremented && previousAllocation !== null && senderId) {
        const { error: rollbackErr } = await supabase
          .from('users')
          .update({ invite_allocation: previousAllocation })
          .eq('id', senderId)
        if (rollbackErr) console.error('Failed to rollback invite_allocation:', rollbackErr)
      }
      let hint = ''
      const m = String(message).toLowerCase()
      if (
        m.includes('only send') ||
        m.includes('verified') ||
        m.includes('not authorized') ||
        m.includes('testing emails')
      ) {
        hint =
          ' Resend may only deliver to addresses you have verified in the Resend dashboard until your sending domain is verified.'
      }
      return res.status(502).json({
        error: 'Email failed to send',
        details: hint ? `${message}${hint}` : message,
      })
    }

    console.log(`Invite created: token=${token}, recipient=${recipientEmailNorm}, inviteUrl=${inviteUrl}`)

    res.json({ success: true, token })
  } catch (err) {
    console.error('Invite send error:', err)
    res.status(500).json({ error: 'Failed to send invite' })
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
      .select('title, description, thumbnail_url')
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
    const recipientFirstName = invite.recipient_name
      ? invite.recipient_name.trim().split(/\s+/)[0]
      : null
    const senderFirst = invite.sender_name ? invite.sender_name.trim().split(/\s+/)[0] : ''
    const ctx = encryptInviteCtx(senderFirst, recipientFirstName || '')
    const inviteUrl = ctx ? `${baseUrl}/i/${invite.token}?ctx=${ctx}` : `${baseUrl}/i/${invite.token}`

    try {
      const htmlBody = buildInviteEmailHtml(
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
      await sendInviteEmailResend(
        withFilmInviteMailingHeaders(
          withReplyTo(
            {
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
      .select('title, description, thumbnail_url')
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
    const recipientFirstName = invite.recipient_name
      ? invite.recipient_name.trim().split(/\s+/)[0]
      : null
    const senderFirst = invite.sender_name ? invite.sender_name.trim().split(/\s+/)[0] : ''
    const ctx = encryptInviteCtx(senderFirst, recipientFirstName || '')
    const inviteUrl = ctx ? `${baseUrl}/i/${invite.token}?ctx=${ctx}` : `${baseUrl}/i/${invite.token}`

    try {
      const htmlBody = buildInviteEmailHtml(
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
      await sendInviteEmailResend(
        withFilmInviteMailingHeaders(
          withReplyTo(
            {
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
          error: 'This person is already on another filmmaker’s team.',
        })
      }
      if (existingProfile.role === 'viewer') {
        if (
          existingProfile.team_creator_id != null &&
          !uuidStringEq(existingProfile.team_creator_id, creatorId)
        ) {
          return res.status(400).json({
            error: 'This viewer is already linked to another filmmaker’s team.',
          })
        }

        const { data: upRows, error: upErr } = await supabase
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
          await sendInviteEmailResend(
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
      await sendInviteEmailResend(
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
    const nameParts = displayName.split(/\s+/)
    const firstName = nameParts[0] || displayName
    const lastName = nameParts.slice(1).join(' ') || ''

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

app.post('/api/team/remove-member', async (req, res) => {
  try {
    const { creatorId, memberId } = req.body
    if (!creatorId || !memberId) {
      return res.status(400).json({ error: 'Creator ID and member ID are required' })
    }
    if (uuidStringEq(creatorId, memberId)) {
      return res.status(400).json({ error: 'You cannot remove yourself' })
    }

    const { data: creator, error: cErr } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', creatorId)
      .single()

    if (cErr || !creator || String(creator.role || '').trim().toLowerCase() !== 'creator') {
      return res.status(403).json({ error: 'Only creators can remove teammates' })
    }

    const { data: member, error: mErr } = await supabase
      .from('users')
      .select('id, role, team_creator_id')
      .eq('id', memberId)
      .single()

    if (mErr || !member) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!uuidStringEq(member.team_creator_id, creatorId)) {
      return res.status(403).json({ error: 'This person is not on your team' })
    }

    const mRole = String(member.role || '').trim().toLowerCase()
    if (mRole === 'creator') {
      return res.status(400).json({ error: 'Invalid team member' })
    }

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

    if (error || !inv) {
      return res.status(404).json({ error: 'Invite not found' })
    }

    const skipExpiryCheck =
      process.env.SKIP_INVITE_EXPIRY_CHECK === '1' ||
      process.env.SKIP_INVITE_EXPIRY_CHECK === 'true'
    if (
      !skipExpiryCheck &&
      inv.expires_at &&
      new Date(inv.expires_at) < new Date()
    ) {
      return res.status(410).json({ error: 'Invite expired' })
    }

    if (inv.status === 'pending') {
      await supabase
        .from('invites')
        .update({ status: 'opened' })
        .eq('id', inv.id)
    }

    const { data: session, error: sessionError } = await supabase
      .from('watch_sessions')
      .insert({
        film_id: inv.film_id,
        invite_token: token,
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Watch session create error:', sessionError.message || sessionError)
    }

    /** Prefer live profile name so the screening intro shows who actually shared (not stale invite.sender_name). */
    let senderDisplayName = inv.sender_name?.trim() || null
    if (inv.sender_id) {
      const { data: senderUser } = await supabase
        .from('users')
        .select('name')
        .eq('id', inv.sender_id)
        .single()
      if (senderUser?.name?.trim()) {
        senderDisplayName = senderUser.name.trim()
      }
    }
    if (!senderDisplayName && inv.sender_email) {
      senderDisplayName = inv.sender_email.split('@')[0] || null
    }

    /** All invites for this film — used by the viewer's network map. Service role bypasses RLS. */
    const { data: filmInvites, error: invitesError } = await supabase
      .from('invites')
      .select('id, film_id, sender_id, sender_name, sender_email, recipient_name, recipient_email, status, created_at, parent_invite_id')
      .eq('film_id', inv.film_id)
      .order('created_at', { ascending: true })

    if (invitesError) {
      console.error('validate: filmInvites load error', invitesError.message || invitesError)
    }

    /** Creator name for the network map root label. */
    let creatorName = ''
    if (inv.films?.creator_id) {
      const { data: creatorUser } = await supabase
        .from('users')
        .select('name')
        .eq('id', inv.films.creator_id)
        .single()
      creatorName = creatorUser?.name?.trim() || ''
    }

    return res.json({
      invite: inv,
      film: inv.films,
      sessionId: session?.id || null,
      senderDisplayName,
      filmInvites: filmInvites || [],
      creatorName,
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
  return `${display} has shared a film with you`
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
  const senderFirstName = senderName ? senderName.trim().split(/\s+/)[0] : 'Someone'
  const receiverFirst = recipientName ? recipientName.trim().split(/\s+/)[0] : ''
  const greeting = receiverFirst ? `Dear ${receiverFirst},` : 'Hello,'
  const origin = siteOriginFromInviteUrl(inviteUrl)
  const unsubUrl = `${origin}/unsubscribe`

  let body = `deepcast\n\nA letter of invitation\n\n`
  body += `${greeting}\n\n`
  body += `${senderFirstName} has thoughtfully curated and shared a short film with you.`
  if (inviteOrdinal) {
    body += ` You are the ${ordinalSuffix(inviteOrdinal)} person to be invited to this private online screening.`
  }
  body += '\n\n'
  if (personalNote && String(personalNote).trim()) {
    body += `${String(personalNote).trim()}\n\n`
  }
  if (filmTitle) body += `${filmTitle}\n`
  if (filmDescription && String(filmDescription).trim()) body += `${String(filmDescription).trim()}\n`
  if (filmTitle || filmDescription) body += '\n'
  body += `Open your invitation:\n${inviteUrl}\n\n`
  body += `— ${senderName || 'Someone'}, via Deepcast\n\n`
  body += `Unsubscribe from screening invitation emails:\n${unsubUrl}\n`
  return body
}

function buildInviteEmailHtml(
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
  const senderFirstName = senderName ? senderName.trim().split(/\s+/)[0] : 'Someone'
  const receiverFirst = recipientName ? recipientName.trim().split(/\s+/)[0] : ''
  const greeting = receiverFirst ? `Dear ${escapeHtml(receiverFirst)},` : 'Hello,'
  const safe = {
    senderFirst: escapeHtml(senderFirstName),
    senderDisplay: escapeHtml(senderName || 'Someone'),
    filmTitle: escapeHtml(filmTitle || ''),
    filmDescription: escapeHtml(filmDescription || ''),
    personalNote: personalNote ? escapeHtml(String(personalNote).trim()) : '',
    inviteUrl: escapeHtml(inviteUrl),
  }

  const intro = `${safe.senderFirst} has thoughtfully curated and shared a short film with you.${
    inviteOrdinal
      ? ` You are the ${ordinalSuffix(inviteOrdinal)} person to be invited to this private online screening.`
      : ''
  }`

  const noteBlock = safe.personalNote
    ? `<p style="margin:0 0 16px;color:#333;">${safe.personalNote.replace(/\n/g, '<br/>')}</p>`
    : ''
  const titleBlock = safe.filmTitle
    ? `<p style="margin:0 0 8px;font-weight:500;">${safe.filmTitle}</p>`
    : ''
  const descBlock = safe.filmDescription
    ? `<p style="margin:0 0 16px;color:#666;font-size:14px;">${safe.filmDescription}</p>`
    : ''

  const origin = siteOriginFromInviteUrl(inviteUrl)
  const unsubUrl = `${origin}/unsubscribe`
  const safeUnsub = escapeHtml(unsubUrl)

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;background-color:#f5f5f0;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;background:#fff;padding:32px 28px;">
<tr><td>
<p style="margin:0 0 20px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;letter-spacing:-0.02em;color:#1a1a1a;">deepcast</p>
<p style="margin:0 0 24px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#666;">A letter of invitation</p>
<p style="margin:0 0 20px;font-size:15px;">${greeting}</p>
<p style="margin:0 0 16px;">${intro}</p>
${noteBlock}
${titleBlock}
${descBlock}
<p style="margin:24px 0;"><a href="${safe.inviteUrl}" style="color:#5C4F3A;font-weight:500;">Open your invitation</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#888;">If the link above doesn't work, paste this URL into your browser:<br/>${safe.inviteUrl}</p>
<p style="margin:24px 0 0;font-size:13px;color:#888;">— ${safe.senderDisplay}, via <span style="font-weight:600;">Deepcast</span></p>
<p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#999;line-height:1.5;">
  <a href="${safeUnsub}" style="color:#666;text-decoration:underline;">Unsubscribe</a> from screening invitation emails.
</p>
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
