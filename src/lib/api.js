const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
const FETCH_TIMEOUT_MS = 10000

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(id)
  )
}

async function request(path, options = {}) {
  // headers must merge AFTER the options spread — otherwise a caller passing
  // custom headers (e.g. relinkInvite's Authorization) silently drops
  // Content-Type and Express parses an empty JSON body.
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    const base = error.error || 'Request failed'
    const raw = error.details
    const details =
      raw == null
        ? ''
        : typeof raw === 'string'
          ? raw
          : JSON.stringify(raw)
    throw new Error(details ? `${base}: ${details}` : base)
  }

  return res.json()
}

export const api = {
  // Mux
  createUploadUrl: (filmId) =>
    request('/mux/upload', {
      method: 'POST',
      body: JSON.stringify({ filmId }),
    }),

  getAssetStatus: (assetId) =>
    request(`/mux/asset/${assetId}`),

  getSignedPlaybackUrl: (playbackId) =>
    request(`/mux/playback/${playbackId}`),

  // Invites
  validateInvite: async (token) => {
    const enc = encodeURIComponent(token)
    const res = await fetchWithTimeout(`${API_BASE}/invites/validate/${enc}`)
    if (res.ok) return res.json()
    if (res.status === 404) throw new Error('invalid')
    if (res.status === 502 || res.status === 503) throw new Error('server_unavailable')
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  },

  sendInvite: (
    filmId,
    recipientEmail,
    recipientName,
    senderName,
    senderId = null,
    senderEmail = null,
    personalNote = null,
    appUrl = null,
    parentInviteId = null,
    recipientFirstName = null,
    recipientLastName = null
  ) =>
    request('/invites/send', {
      method: 'POST',
      body: JSON.stringify({
        filmId,
        recipientEmail,
        recipientName,
        recipientFirstName,
        recipientLastName,
        senderName,
        senderId,
        senderEmail,
        personalNote,
        appUrl,
        parentInviteId,
      }),
    }),

  // Claim-link landing page (public, slug-based — minimal payload by design)
  getLinkInvite: async (slug) => {
    const enc = encodeURIComponent(slug)
    const res = await fetchWithTimeout(`${API_BASE}/invites/link/${enc}`)
    if (res.ok) return res.json()
    if (res.status === 404) throw new Error('invalid')
    if (res.status === 502 || res.status === 503) throw new Error('server_unavailable')
    const error = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || 'Request failed')
  },

  // Generate a claim link. Sharers pass their claimed invite id (their
  // identity when no session exists) and/or filmId + a session token;
  // parentInviteId lets a session-holding claimant keep exact lineage.
  createInviteLink: (inviteeFirstName, { claimedInviteId = null, filmId = null, accessToken = null, appUrl = null, parentInviteId = null } = {}) =>
    request('/invites/create-link', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: JSON.stringify({ inviteeFirstName, claimedInviteId, filmId, appUrl, parentInviteId }),
    }),

  // Claim a link invite — the email IS the claim action (one field, no account).
  // accessToken (when a session exists) lets the server recognize the sharer
  // opening their own link and refuse to claim it.
  claimLinkInvite: (slug, email, accessToken = null) =>
    request('/invites/claim', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: JSON.stringify({ slug, email }),
    }),

  // Passwordless invite-first sign-in
  inviteSession: (token, email, appUrl = null) =>
    request('/invites/session', {
      method: 'POST',
      body: JSON.stringify({ token, email, appUrl }),
    }),

  relinkInvite: (token, accessToken) =>
    request('/invites/relink', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: JSON.stringify({ token }),
    }),

  // Owner-only admin (server enforces the ADMIN_USER_ID pin; these just pass the session token)
  adminTicketStatuses: (userIds, accessToken) =>
    request('/admin/ticket-controls/status', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: JSON.stringify({ userIds }),
    }),

  // One mutating call: {userId, action:'grant', amount} or {userId, action:'set_unlimited', unlimited}
  adminTicketControl: (payload, accessToken) =>
    request('/admin/ticket-controls', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: JSON.stringify(payload),
    }),

  // Delete-with-splice (Piece C): preview = {filmId, email} or {filmId, inviteId};
  // execute additionally carries confirmEmail (person targets).
  adminDeletePreview: (payload, accessToken) =>
    request('/admin/delete-person/preview', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: JSON.stringify(payload),
    }),

  adminDeleteExecute: (payload, accessToken) =>
    request('/admin/delete-person', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: JSON.stringify(payload),
    }),

  sendSignInLink: (email, appUrl = null, redirectPath = '/dashboard') =>
    request('/auth/signin-link', {
      method: 'POST',
      body: JSON.stringify({ email, appUrl, redirectPath }),
    }),

  resendLastInvite: (filmId, senderId, appUrl = null) =>
    request('/invites/resend-last', {
      method: 'POST',
      body: JSON.stringify({ filmId, senderId, appUrl }),
    }),

  resendInviteById: (inviteId, appUrl = null) =>
    request('/invites/resend', {
      method: 'POST',
      body: JSON.stringify({ inviteId, appUrl }),
    }),

  // Resend
  sendInviteEmail: (to, senderName, filmTitle, filmDescription, token) =>
    request('/email/invite', {
      method: 'POST',
      body: JSON.stringify({ to, senderName, filmTitle, filmDescription, token }),
    }),

  // Team (creator invites teammates; public register with token)
  getTeamInviteInfo: async (token) => {
    const res = await fetch(
      `${API_BASE}/team/invite-info?token=${encodeURIComponent(token)}`
    )
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      const base = error.error || 'Request failed'
      const d = error.details
      const details =
        d == null ? '' : typeof d === 'string' ? d : JSON.stringify(d)
      throw new Error(details ? `${base}: ${details}` : base)
    }
    return res.json()
  },

  sendTeamInvite: (creatorId, inviteeEmail, inviteeName, appUrl = null) =>
    request('/team/send-invite', {
      method: 'POST',
      body: JSON.stringify({
        creatorId,
        inviteeEmail,
        inviteeName: inviteeName || null,
        appUrl,
      }),
    }),

  registerTeamMember: (token, password, fullName = null) =>
    request('/team/register', {
      method: 'POST',
      body: JSON.stringify({ token, password, fullName }),
    }),

  // Identity is the verified session token — the server never trusts a client-sent creatorId.
  removeTeamMember: (memberId, accessToken) =>
    request('/team/remove-member', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: JSON.stringify({ memberId }),
    }),
}
