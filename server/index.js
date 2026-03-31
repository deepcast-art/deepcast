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

function generateTeamInviteToken() {
  return crypto.randomBytes(24).toString('hex')
}

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
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

      if (sender.role === 'creator' && film.creator_id !== sender.id) {
        return res.status(403).json({ error: 'You can only invite people to your own films' })
      }

      if (sender.role === 'team_member') {
        if (!sender.team_creator_id || film.creator_id !== sender.team_creator_id) {
          return res.status(403).json({ error: 'You can only invite people to your team’s films' })
        }
      }

      const unlimitedInvites = sender.role === 'creator' || sender.role === 'team_member'

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

// ============ TEAM MEMBER INVITES (creators → teammates, unlimited film invites) ============

function buildTeamInviteEmailHtml(creatorName, joinUrl) {
  const safeCreator = escapeHtml(creatorName || 'Your filmmaker')
  const safeUrl = escapeHtml(joinUrl)
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#080c18;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:36px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background-color:#E1DED6;border-radius:12px;padding:40px 28px;">
        <tr><td>
          <p style="margin:0 0 12px;color:#2C2C2C;font-size:10px;letter-spacing:0.35em;text-transform:uppercase;text-align:center;">Deepcast · team</p>
          <p style="margin:0 0 24px;color:#2C2C2C;font-size:18px;line-height:1.5;text-align:center;font-style:italic;">
            ${safeCreator} invited you to join their team on Deepcast.
          </p>
          <p style="margin:0 0 28px;color:#6E6E6E;font-size:14px;line-height:1.65;text-align:center;">
            Create your password to access the dashboard and send screening invitations on their behalf.
          </p>
          <table align="center" cellpadding="0" cellspacing="0"><tr><td style="background-color:#B5A680;">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:11px;font-weight:500;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;">
              Complete registration
            </a>
          </td></tr></table>
          <p style="margin:28px 0 0;color:#8A8880;font-size:11px;line-height:1.6;text-align:center;">
            If the button doesn&rsquo;t work, paste this link:<br/>
            <a href="${safeUrl}" style="color:#5C4F3A;word-break:break-all;">${safeUrl}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function buildTeamInviteEmailPlainText(creatorName, joinUrl) {
  const n = creatorName || 'Your filmmaker'
  return `${n} invited you to join their Deepcast team.\n\nCreate your password here:\n${joinUrl}\n\n—\ndeepcast\n`
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

    if (cErr || !creator || creator.role !== 'creator') {
      return res.status(403).json({ error: 'Only creators can invite teammates' })
    }

    if (normalizeEmail(creator.email) === emailNorm) {
      return res.status(400).json({ error: 'You cannot invite your own email' })
    }

    const { data: existingProfile } = await supabase
      .from('users')
      .select('id, role, team_creator_id')
      .eq('email', emailNorm)
      .maybeSingle()

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
        const { error: upErr } = await supabase
          .from('users')
          .update({
            role: 'team_member',
            team_creator_id: creatorId,
            invite_allocation: 0,
          })
          .eq('id', existingProfile.id)

        if (upErr) {
          console.error('team send-invite viewer upgrade:', upErr)
          return res.status(500).json({ error: 'Failed to add teammate' })
        }

        await supabase
          .from('team_invites')
          .delete()
          .eq('creator_id', creatorId)
          .eq('email', emailNorm)
          .is('accepted_at', null)

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

    const { error: insErr } = await supabase.from('team_invites').insert({
      creator_id: creatorId,
      email: emailNorm,
      invited_name: typeof inviteeName === 'string' && inviteeName.trim() ? inviteeName.trim() : null,
      token,
      expires_at: expiresAt.toISOString(),
    })

    if (insErr) {
      console.error('team_invites insert:', insErr)
      return res.status(500).json({ error: 'Failed to create team invite' })
    }

    const baseUrl = resolveBaseUrl(appUrl, req.get('origin'))
    const joinUrl = `${baseUrl}/team/join?token=${encodeURIComponent(token)}`

    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'Deepcast <onboarding@resend.dev>'
      await sendInviteEmailResend({
        from: fromEmail,
        to: emailNorm,
        subject: `${creator.name || 'Your filmmaker'} invited you to the Deepcast team`,
        html: buildTeamInviteEmailHtml(creator.name, joinUrl),
        text: buildTeamInviteEmailPlainText(creator.name, joinUrl),
      })
    } catch (emailErr) {
      const message = emailErr?.message || 'Email send failed'
      console.error('Team invite email error:', message)
      await supabase.from('team_invites').delete().eq('token', token)
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

    const { data: row, error } = await supabase
      .from('team_invites')
      .select('email, invited_name, expires_at, accepted_at, creator_id')
      .eq('token', token)
      .maybeSingle()

    if (error || !row) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    if (row.accepted_at) {
      return res.status(410).json({ error: 'This invitation was already used' })
    }

    if (new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This invitation has expired' })
    }

    const { data: creator } = await supabase
      .from('users')
      .select('name')
      .eq('id', row.creator_id)
      .single()

    res.json({
      email: row.email,
      invitedName: row.invited_name || '',
      creatorName: creator?.name || 'Your filmmaker',
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

    const { data: row, error: rowErr } = await supabase
      .from('team_invites')
      .select('*')
      .eq('token', t)
      .maybeSingle()

    if (rowErr || !row) {
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

    await supabase
      .from('team_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', row.id)

    res.json({ success: true, userId })
  } catch (err) {
    console.error('team register error:', err)
    res.status(500).json({ error: 'Registration failed' })
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
  body += 'Open your invitation:\n'
  body += `${inviteUrl}\n\n`
  body += "If the button doesn't work, use this link:\n"
  body += `${inviteUrl}\n\n`
  body += `With intention,\n${senderName || 'Someone'}\n\n`
  body += `You were invited by ${senderName || 'Someone'}. This film is not publicly available. It travels only through people.\n`
  body += '\n—\ndeepcast\n'
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
  /* Brand palette — invite letter + CTA (matches in-app invite + design refs) */
  const C = {
    pageBg: '#080c18',
    cardBg: '#E1DED6',
    cardBgAlt: '#E5E2D9',
    text: '#2C2C2C',
    textMuted: '#6E6E6E',
    textSoft: '#8A8880',
    rule: '#B8B5AD',
    btnBg: '#B5A680',
    btnText: '#FFFFFF',
    link: '#5C4F3A',
  }

  const fontSans =
    "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif"
  const fontSerifItalic =
    "Georgia, 'Times New Roman', Times, serif"

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

  const dearLine = greetingName
    ? `Dear ${safe.greeting},`
    : 'Hello,'

  const personalBlock =
    personalNote && safe.personalNote
      ? `
          <tr>
            <td align="center" style="padding: 0 28px 28px;">
              <p style="margin: 0; color: ${C.textMuted}; font-family: ${fontSerifItalic}; font-size: 16px; font-style: italic; line-height: 1.75; text-align: center; max-width: 420px;">
                ${safe.personalNote}
              </p>
            </td>
          </tr>`
      : ''

  const thumbBlock = thumbForEmail
    ? `
          <tr>
            <td align="center" style="padding: 0 28px 24px;">
              <img src="${safe.thumbUrl}" alt="${safe.filmTitle}" width="400" border="0" decoding="async" style="width: 100%; max-width: 400px; height: auto; border: 0; border-radius: 8px; display: block; margin: 0 auto; outline: none; text-decoration: none;" />
            </td>
          </tr>`
    : ''

  const titleRow =
    filmTitle && String(filmTitle).trim()
      ? `
          <tr>
            <td align="center" style="padding: 0 28px 16px;">
              <p style="margin: 0; color: ${C.text}; font-family: ${fontSerifItalic}; font-size: 17px; font-style: italic; line-height: 1.4; text-align: center;">
                ${safe.filmTitle}
              </p>
            </td>
          </tr>`
      : ''

  const descBlock = filmDescription
    ? `
          <tr>
            <td align="center" style="padding: 0 28px 32px;">
              <p style="margin: 0; color: ${C.textSoft}; font-family: ${fontSerifItalic}; font-size: 15px; font-style: italic; line-height: 1.65; text-align: center; max-width: 420px;">
                ${safe.filmDescription}
              </p>
            </td>
          </tr>`
    : '<tr><td style="padding-bottom: 24px;"></td></tr>'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: ${C.pageBg}; font-family: ${fontSans}; font-weight: 400;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: ${C.pageBg}; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 520px; background-color: ${C.cardBg}; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 44px 28px 20px; background-color: ${C.cardBg};">
              <p style="margin: 0; color: ${C.text}; font-family: ${fontSans}; font-size: 10px; font-weight: 400; letter-spacing: 0.42em; line-height: 1.4; text-align: center; text-transform: uppercase;">
                A letter of invitation
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 0 28px 28px;">
              <table align="center" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 auto;">
                <tr>
                  <td width="1" height="28" bgcolor="${C.rule}" style="width: 1px; height: 28px; line-height: 28px; font-size: 0; background-color: ${C.rule};">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 0 28px 20px;">
              <p style="margin: 0; color: ${C.text}; font-family: ${fontSerifItalic}; font-size: 18px; font-style: italic; line-height: 1.5; text-align: center;">
                ${dearLine}
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 0 28px 28px;">
              <p style="margin: 0; color: ${C.text}; font-family: ${fontSerifItalic}; font-size: 16px; font-style: italic; line-height: 1.75; text-align: center; max-width: 420px;">
                ${introLine}
              </p>
            </td>
          </tr>

          ${personalBlock}

          ${titleRow}

          ${thumbBlock}

          ${descBlock}

          <tr>
            <td align="center" style="padding: 0 28px 12px; background-color: ${C.cardBgAlt};">
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 0;">
                    <a href="${safe.inviteUrl}" style="display: inline-block; background-color: ${C.btnBg}; color: ${C.btnText}; font-family: ${fontSans}; font-size: 11px; font-weight: 500; letter-spacing: 0.18em; line-height: 1.2; padding: 16px 40px; text-align: center; text-decoration: none; text-transform: uppercase; border-radius: 0;">
                      Open your invitation
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 24px 28px 40px; background-color: ${C.cardBgAlt};">
              <p style="margin: 0; color: ${C.textMuted}; font-family: ${fontSerifItalic}; font-size: 16px; font-style: italic; line-height: 1.6; text-align: center;">
                With intention,<br />
                <span style="color: ${C.text};">${safe.senderDisplay}</span>
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 0 28px 32px; background-color: ${C.cardBg};">
              <p style="margin: 0; color: ${C.textSoft}; font-family: ${fontSans}; font-size: 11px; line-height: 1.65; text-align: center; max-width: 400px;">
                If the button doesn&rsquo;t work, copy this link:<br />
                <a href="${safe.inviteUrl}" style="color: ${C.link}; text-decoration: underline; word-break: break-all;">${safe.inviteUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 0 28px 36px;">
              <p style="margin: 0; color: ${C.textSoft}; font-family: ${fontSans}; font-size: 11px; line-height: 1.65; text-align: center; max-width: 400px;">
                You were invited by ${safe.senderDisplay}. This film is not publicly available. It travels only through people.
              </p>
              <p style="margin: 20px 0 0; color: ${C.text}; font-family: ${fontSans}; font-size: 10px; letter-spacing: 0.14em; text-transform: lowercase; text-align: center;">
                deepcast
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
