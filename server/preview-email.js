import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

function escapeHtml(s) {
  if (s == null || s === '') return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

function buildInviteEmailHtml({
  senderName,
  recipientName,
  filmTitle,
  filmDescription,
  filmGifUrl,
  inviteUrl,
  senderEmail,
  inviteOrdinal,
  personalNote,
}) {
  const safe = {
    senderDisplay: escapeHtml(senderName || 'Someone'),
    senderUpper: escapeHtml((senderName || 'Someone').toUpperCase()),
    recipientName: escapeHtml(recipientName || ''),
    filmTitle: escapeHtml(filmTitle || ''),
    filmDescription: escapeHtml(filmDescription || ''),
    personalNote: personalNote ? escapeHtml(String(personalNote).trim()) : '',
    inviteUrl: escapeHtml(inviteUrl),
    filmGifUrl: filmGifUrl ? escapeHtml(filmGifUrl) : null,
  }

  const gifBlock = safe.filmGifUrl
    ? `<tr><td style="padding:16px 0;">
        <a href="${safe.inviteUrl}" style="display:block;text-decoration:none;">
          <img src="${safe.filmGifUrl}" width="480" alt="${safe.filmTitle}" style="display:block;width:100%;max-width:600px;border:0;" />
        </a>
      </td></tr>`
    : ''

  const noteBlock = safe.personalNote
    ? `<tr><td style="padding:0 40px 40px;">
        <p style="margin:0 0 10px;font-size:10px;letter-spacing:3px;color:#6b7fa3;font-family:system-ui,-apple-system,sans-serif;">A PERSONAL NOTE FROM ${safe.senderUpper}</p>
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-style:normal;font-size:16px;line-height:1.7;color:#e8e4dc;">${safe.personalNote.replace(/\n/g, '<br/>')}</p>
        <p style="margin:16px 0 0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:14px;color:#6b7fa3;">— ${safe.senderDisplay}</p>
      </td></tr>`
    : ''

  const curatorSentence = `${safe.senderDisplay} has thoughtfully curated and shared a short film with you.${
    inviteOrdinal ? ` You are the ${ordinalSuffix(inviteOrdinal)} person to be invited to this private screening.` : ''
  }`

  const greetingBlock = safe.recipientName
    ? `<tr><td style="padding:0 40px 0;">
        <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;color:#c8d0dc;">Dear ${safe.recipientName},</p>
      </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0c1220;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#0c1220;">
<tr><td align="center" style="padding:0;">
<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background-color:#0c1220;">

<tr><td align="center" style="padding:24px 40px 0;">
  <img src="https://wmtjgpxhjtbocsmutqqc.supabase.co/storage/v1/object/public/film-assets/deepcast-logo-cropped.png" width="220" alt="deepcast" style="display:block;border:0;margin:0 auto;" />
</td></tr>

<tr><td align="center" style="padding:0 40px 24px;">
  <p style="margin:0;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#6b7fa3;font-family:system-ui,-apple-system,sans-serif;">A PRIVATE SCREENING INVITATION</p>
  <p style="margin:8px 0 0;font-size:10px;letter-spacing:3px;color:#6b7fa3;font-family:system-ui,-apple-system,sans-serif;">GIFTED BY ${safe.senderUpper}</p>
</td></tr>

${greetingBlock}

<tr><td style="padding:16px 40px 32px;">
  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#c8d0dc;">${curatorSentence}</p>
</td></tr>

${noteBlock}

<tr><td style="padding:0 40px 12px;">
  <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-weight:700;font-size:15px;letter-spacing:2px;text-transform:uppercase;color:#ffffff;">${safe.filmTitle}</p>
</td></tr>

${gifBlock}

<tr><td style="padding:0 40px 32px;">
  <p style="margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#8a9bb8;">${safe.filmDescription}</p>
</td></tr>

<tr><td align="center" style="padding:0 40px 40px;">
  <table cellpadding="0" cellspacing="0" role="presentation">
    <tr><td style="background-color:#b8a06a;border-radius:2px;">
      <a href="${safe.inviteUrl}" style="display:inline-block;padding:18px 48px;font-family:system-ui,-apple-system,sans-serif;font-weight:700;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#0c1220;text-decoration:none;">ACCEPT YOUR INVITATION</a>
    </td></tr>
  </table>
</td></tr>

<tr><td align="center" style="padding:24px 40px;">
  <p style="margin:0;font-size:10px;color:#2a3a5a;letter-spacing:2px;font-family:system-ui,-apple-system,sans-serif;">© deepcast</p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

const html = buildInviteEmailHtml({
  senderName: 'Ien Chi',
  recipientName: 'Jerry',
  filmTitle: 'A Conversation with Trace & Tina by Ien Chi',
  filmDescription: 'The masses are burning out. The world order is cracking. People are realizing: this system never worked for anyone.',
  filmGifUrl: 'https://image.mux.com/test123/animated.gif?width=380&fps=10',
  inviteUrl: 'https://deepcast.art/i/test123',
  inviteOrdinal: 3,
  personalNote: 'This is a personal note!',
})

const outPath = join(dirname(fileURLToPath(import.meta.url)), 'email-preview.html')
writeFileSync(outPath, html, 'utf8')
console.log('Preview written to', outPath)
