const API_BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
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
    const res = await fetch(`${API_BASE}/invites/validate/${token}`)
    if (res.ok) return res.json()
    if (res.status === 410) throw new Error('expired')
    if (res.status === 404) throw new Error('invalid')
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
    appUrl = null
  ) =>
    request('/invites/send', {
      method: 'POST',
      body: JSON.stringify({
        filmId,
        recipientEmail,
        recipientName,
        senderName,
        senderId,
        senderEmail,
        personalNote,
        appUrl,
      }),
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
      throw new Error(error.error || 'Request failed')
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
}
