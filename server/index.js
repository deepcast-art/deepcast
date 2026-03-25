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

const resendFromEnv = process.env.RESEND_FROM_EMAIL || ''
if (
  resendFromEnv &&
  (resendFromEnv.includes('onboarding@resend.dev') || resendFromEnv.includes('@resend.dev'))
) {
  console.warn(
    '[email] RESEND_FROM_EMAIL uses resend.dev — use a verified domain (e.g. invites@yourdomain.com) in production for Gmail trust and images.'
  )
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
const APP_URL = process.env.APP_URL || 'http://localhost:5173'

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

function resolveBaseUrl(appUrl, origin) {
  const normalizedAppUrl = typeof appUrl === 'string' ? appUrl.trim() : ''
  const normalizedOrigin = typeof origin === 'string' ? origin.trim() : ''
  const isLocalUrl = (value) => /localhost|127\.0\.0\.1/i.test(value)
  if (normalizedAppUrl && !isLocalUrl(normalizedAppUrl)) return normalizedAppUrl
  if (normalizedOrigin && !isLocalUrl(normalizedOrigin)) return normalizedOrigin
  return APP_URL
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

async function sendInviteEmailResend(payload) {
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is not set — cannot send email')
  }
  const { data, error } = await resend.emails.send(payload)
  if (error) {
    const msg = formatResendError(error)
    console.error('Resend API error:', msg, error)
    const e = new Error(msg)
    e.resendError = error
    throw e
  }
  if (data?.id) console.log('Resend email id:', data.id)
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

    const recipientEmailNorm = String(recipientEmail).trim()
    let previousAllocation = null
    let allocationDecremented = false

    // Check sender's invite allocation if they're a registered user
    if (senderId) {
      const { data: sender, error: senderError } = await supabase
        .from('users')
        .select('invite_allocation, role')
        .eq('id', senderId)
        .single()

      if (senderError) {
        console.error('Invite allocation lookup error:', senderError.message || senderError)
        return res.status(500).json({ error: 'Unable to verify invites' })
      }

      if (!sender) {
        return res.status(404).json({ error: 'Sender not found' })
      }

      if (sender.role !== 'creator' && sender.invite_allocation <= 0) {
        console.warn('No invites remaining for sender:', senderId, sender)
        return res.status(400).json({
          error: 'No invites remaining',
          details: { senderId, invite_allocation: sender.invite_allocation },
        })
      }

      if (sender.role !== 'creator') {
        previousAllocation = sender.invite_allocation
        // Decrement invite allocation for viewers only
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

    // Get the film details
    const { data: film } = await supabase
      .from('films')
      .select('title, description, thumbnail_url')
      .eq('id', filmId)
      .single()

    if (!film) {
      return res.status(404).json({ error: 'Film not found' })
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
    const inviteUrl = `${baseUrl}/i/${token}`
    const displaySender = senderName || 'Someone'
    const displaySenderEmail = senderEmail || null
    const recipientFirstName = recipientName ? recipientName.trim().split(/\s+/)[0] : null

    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'Deepcast <onboarding@resend.dev>'
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
        withReplyTo(
          {
            from: fromEmail,
            to: recipientEmailNorm,
            subject: formatInviteEmailSubject(displaySender),
            html: htmlBody,
            text: textBody,
          },
          displaySenderEmail
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
      return res.status(502).json({ error: 'Email failed to send', details: message })
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
    const inviteUrl = `${baseUrl}/i/${invite.token}`
    const displaySender = invite.sender_name || 'Someone'
    const displaySenderEmail = invite.sender_email || null
    const recipientFirstName = invite.recipient_name
      ? invite.recipient_name.trim().split(/\s+/)[0]
      : null

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Deepcast <hello@deepcast.com>'
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
        withReplyTo(
          {
            from: fromEmail,
            to: invite.recipient_email,
            subject: formatInviteEmailSubject(displaySender),
            html: htmlBody,
            text: textBody,
          },
          displaySenderEmail
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
    const inviteUrl = `${baseUrl}/i/${invite.token}`
    const displaySender = invite.sender_name || 'Someone'
    const displaySenderEmail = invite.sender_email || null
    const recipientFirstName = invite.recipient_name
      ? invite.recipient_name.trim().split(/\s+/)[0]
      : null

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Deepcast <hello@deepcast.com>'
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
        withReplyTo(
          {
            from: fromEmail,
            to: invite.recipient_email,
            subject: formatInviteEmailSubject(displaySender),
            html: htmlBody,
            text: textBody,
          },
          displaySenderEmail
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

    if (new Date(inv.expires_at) < new Date()) {
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

/** Plain-text alternative — improves deliverability (Gmail, corporate filters). */
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
  const greetingLine = recipientName ? `${recipientName.trim()},` : 'Hello,'
  let body = `${greetingLine}\n\n`
  body += `${senderFirstName} has thoughtfully curated and shared a short film with you.`
  if (inviteOrdinal) {
    body += ` You are the ${ordinalSuffix(inviteOrdinal)} person to be invited to this private online screening.`
  }
  body += '\n\n'
  if (personalNote && String(personalNote).trim()) {
    body += `Here's ${senderFirstName}'s message to you:\n\n${String(personalNote).trim()}\n\n`
  }
  const thumbForEmail = ensureHttpsUrl(filmThumbnailUrl)
  if (thumbForEmail) {
    body += `Film: ${filmTitle || 'Screening'}\n`
    body += `Thumbnail: ${thumbForEmail}\n\n`
  }
  if (filmDescription && String(filmDescription).trim()) {
    body += `${String(filmDescription).trim()}\n\n`
  }
  body += 'Receive your film:\n'
  body += `${inviteUrl}\n\n`
  body += "If the button doesn't work, use this link:\n"
  body += `${inviteUrl}\n\n`
  body += `You were invited by ${senderName || 'Someone'}. This film is not publicly available. It travels only through people.\n`
  body += '\n—\nDEEPCAST\n'
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
  const thumbForEmail = ensureHttpsUrl(filmThumbnailUrl)
  const senderFirstName = senderName ? senderName.trim().split(/\s+/)[0] : 'Someone'
  const greetingName = recipientName ? recipientName.trim() : ''
  const safe = {
    senderFirst: escapeHtml(senderFirstName),
    greeting: escapeHtml(greetingName),
    filmTitle: escapeHtml(filmTitle || ''),
    filmDescription: escapeHtml(filmDescription || ''),
    personalNote: personalNote ? escapeHtml(personalNote) : '',
    inviteUrl: escapeHtml(inviteUrl),
    senderDisplay: escapeHtml(senderName || 'Someone'),
    thumbUrl: thumbForEmail ? escapeHtml(thumbForEmail) : '',
  }

  const introLine = `${safe.senderFirst} has thoughtfully curated and shared a short film with you.${
    inviteOrdinal
      ? ` You are the ${ordinalSuffix(inviteOrdinal)} person to be invited to this private online screening.`
      : ''
  }`

  const greetingLine = greetingName
    ? `<p style="margin: 0 0 16px; color: #1a1714; font-size: 14px; line-height: 1.6; text-align: left; max-width: 360px;">${safe.greeting},</p>`
    : `<p style="margin: 0 0 16px; color: #1a1714; font-size: 14px; line-height: 1.6; text-align: left; max-width: 360px;">Hello,</p>`

  const personalBlock =
    personalNote && safe.personalNote
      ? `
          <tr>
            <td style="padding-bottom: 12px;">
              <p style="margin: 0; color: #1a1714; font-size: 14px; line-height: 1.6; text-align: left; max-width: 360px;">
                Here&rsquo;s ${safe.senderFirst}&rsquo;s message to you:
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 24px;">
              <p style="margin: 0; color: #1a1714; font-size: 14px; line-height: 1.6; text-align: left; max-width: 360px; border-left: 2px solid #d4cfc4; padding-left: 14px;">
                ${safe.personalNote}
              </p>
            </td>
          </tr>`
      : ''

  const thumbBlock = thumbForEmail
    ? `
          <tr>
            <td style="padding-bottom: 16px;">
              <img src="${safe.thumbUrl}" alt="${safe.filmTitle}" width="360" border="0" decoding="async" style="width: 100%; max-width: 360px; height: auto; border: 0; border-radius: 2px; display: block; outline: none; text-decoration: none;" />
            </td>
          </tr>`
    : ''

  const descBlock = filmDescription
    ? `
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="margin: 0; color: #8a8070; font-size: 14px; line-height: 1.6; text-align: left; max-width: 360px;">
                ${safe.filmDescription}
              </p>
            </td>
          </tr>`
    : '<tr><td style="padding-bottom: 32px;"></td></tr>'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f0e8; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 300;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f0e8; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px;">
          <tr>
            <td align="center" style="padding-bottom: 40px;">
              <span style="color: #c4822a; font-family: 'DM Serif Display', Georgia, serif; font-size: 12px; letter-spacing: 4px; text-transform: uppercase;">DEEPCAST</span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 40px;">
              <div style="width: 40px; height: 1px; background-color: #d4cfc4;"></div>
            </td>
          </tr>

          <tr>
            <td>
              ${greetingLine}
            </td>
          </tr>

          <tr>
            <td style="padding-bottom: 20px;">
              <p style="margin: 0; color: #1a1714; font-size: 14px; line-height: 1.6; text-align: left; max-width: 360px;">
                ${introLine}
              </p>
            </td>
          </tr>

          ${personalBlock}

          ${thumbBlock}

          ${descBlock}

          <tr>
            <td align="left" style="padding-bottom: 24px; text-align: left;">
              <a href="${safe.inviteUrl}" style="display: inline-block; background-color: #1a1714; color: #f5f0e8; text-decoration: none; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; font-weight: 500; padding: 14px 32px; border-radius: 0;">
                Receive your film
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <p style="margin: 0; color: #8a8070; font-size: 12px; line-height: 1.6; max-width: 360px; text-align: left;">
                If the button doesn&rsquo;t work:<br />
                <a href="${safe.inviteUrl}" style="color: #c4822a; text-decoration: none; word-break: break-all;">${safe.inviteUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <div style="width: 40px; height: 1px; background-color: #d4cfc4;"></div>
            </td>
          </tr>

          <tr>
            <td align="center">
              <p style="margin: 0; color: #8a8070; font-size: 12px; line-height: 1.6; text-align: left; max-width: 360px;">
                You were invited by ${safe.senderDisplay}. This film is not publicly available. It travels only through people.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ============ START SERVER ============

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Deepcast API server running on port ${PORT}`)
})
