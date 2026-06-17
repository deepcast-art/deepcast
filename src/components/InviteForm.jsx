import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'

/** Keep the success message visible briefly before notifying the parent. */
const ON_INVITE_SENT_DELAY_MS = 2200

export default function InviteForm({
  filmId,
  senderName,
  senderEmail,
  senderId,
  /** The sender's invitations remaining at mount — callers MUST pass
   *  `invitationsRemaining(profile)` (src/lib/shares.js), never a hardcoded cap.
   *  Defaults to 0 (fail closed) so a missing quota can never over-promise. */
  maxInvites = 0,
  unlimited = false,
  onInviteSent,
}) {
  /** See slotsRemaining: the quota is frozen at mount on purpose. */
  const [quotaAtMount] = useState(() => Math.max(0, maxInvites))
  const [recipients, setRecipients] = useState(() => [{ firstName: '', lastName: '', email: '', note: '' }])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState([])
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const onInviteSentTimeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      if (onInviteSentTimeoutRef.current) {
        clearTimeout(onInviteSentTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!successMessage) return
    const t = setTimeout(() => setSuccessMessage(''), 8000)
    return () => clearTimeout(t)
  }, [successMessage])

  const updateRecipient = (index, key, value) => {
    const updated = [...recipients]
    updated[index] = { ...updated[index], [key]: value }
    setRecipients(updated)
  }

  const removeEmail = (index) => {
    setRecipients(recipients.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    const validRecipients = recipients.filter((r) => {
      const e = r.email.trim()
      return e && e.includes('@')
    })
    if (validRecipients.length === 0) {
      setError('Please add a valid email for each invite.')
      return
    }

    // First and last name are both mandatory for every recipient.
    if (validRecipients.some((r) => !r.firstName.trim() || !r.lastName.trim())) {
      setError('Each invitation needs the recipient’s first and last name.')
      return
    }

    // Personal notes are mandatory — the note is the gift, not the link.
    if (validRecipients.some((r) => !r.note.trim())) {
      setError('Each invitation needs a personal note — even one warm sentence about why this film made you think of them.')
      return
    }

    if (!unlimited && validRecipients.length > slotsRemaining) {
      setError(
        `You can only send ${slotsRemaining} more invitation${slotsRemaining !== 1 ? 's' : ''} in this batch. Remove a row or send fewer.`
      )
      return
    }

    setSuccessMessage('')
    if (onInviteSentTimeoutRef.current) {
      clearTimeout(onInviteSentTimeoutRef.current)
      onInviteSentTimeoutRef.current = null
    }

    setSending(true)
    setError('')

    // Per-recipient truth: each send is confirmed by the server (which only
    // answers success once the email was accepted for delivery). A failure
    // keeps that recipient in the form for retry and never hides behind a
    // neighbour's success.
    const succeeded = []
    const failed = []
    try {
      const appUrl = window?.location?.origin || null

      for (const recipient of validRecipients) {
        try {
          const { data: existing } = await supabase
            .from('invites')
            .select('id')
            .eq('film_id', filmId)
            .ilike('recipient_email', recipient.email.trim())
            .limit(1)
            .maybeSingle()

          if (existing) {
            failed.push({
              ...recipient,
              reason: 'has already received an invitation to this film',
            })
            continue
          }

          const recipientNote = recipient.note.trim()
          // recipientName stays first-name only (every display surface reads it as such);
          // the last name rides alongside and is stored in its own column.
          const recipientName = recipient.firstName.trim()
          await api.sendInvite(
            filmId,
            recipient.email.trim(),
            recipientName,
            senderName,
            senderId,
            senderEmail,
            recipientNote,
            appUrl,
            null,
            recipient.firstName.trim(),
            recipient.lastName.trim()
          )
          succeeded.push(recipient)
          setSent((prev) => [...prev, recipient])
        } catch (err) {
          console.error('Invite send error:', err)
          failed.push({ ...recipient, reason: err.message || 'could not be sent' })
        }
      }

      if (failed.length) {
        // Keep exactly the failed recipients in the form so they can retry.
        setRecipients(failed.map(({ firstName, lastName, email, note }) => ({ firstName, lastName, email, note })))
        setError(
          failed
            .map((f) => `${f.firstName.trim() || f.email.trim()} ${f.reason}`)
            .join(' — ')
        )
      } else {
        setRecipients([{ firstName: '', lastName: '', email: '', note: '' }])
      }

      if (succeeded.length) {
        const oneName =
          succeeded[0].firstName.trim() ||
          succeeded[0].email.trim().split('@')[0] ||
          'them'
        const msg =
          succeeded.length === 1
            ? `Invitation sent to ${oneName}. They’ll receive an email with a private screening link.`
            : `${succeeded.length} invitations sent. Each person will receive an email with a private screening link.`
        setSuccessMessage(msg)

        if (onInviteSent) {
          const payload = {
            senderName,
            senderEmail,
            recipients: succeeded,
          }
          onInviteSentTimeoutRef.current = setTimeout(() => {
            onInviteSent(payload)
            onInviteSentTimeoutRef.current = null
          }, ON_INVITE_SENT_DELAY_MS)
        }
      }
    } finally {
      setSending(false)
    }
  }

  /** Invites left to send: the quota at mount minus this session's completed
   *  sends. The server decrements the allocation once per send, so this always
   *  equals the live allocation — deliberately ignoring later `maxInvites` prop
   *  changes (a parent refetching the profile after a send would otherwise make
   *  us subtract the same send twice). Draft rows don't count. */
  const slotsRemaining = unlimited
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, quotaAtMount - sent.length)

  if (!unlimited && sent.length >= quotaAtMount) {
    return (
      <div className="text-center">
        <p className="text-text-muted text-sm">All invitations sent.</p>
        <div className="mt-4 space-y-1">
          {sent.map((entry) => (
            <p key={entry.email} className="text-success text-sm">
              Invited {entry.firstName} ({entry.email})
            </p>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="text-success text-sm text-center mb-4 bg-success/10 border border-success/25 rounded-none py-3 px-4"
        >
          <span className="font-medium">Done. </span>
          {successMessage}
        </div>
      )}
      {error && (
        <div className="text-error text-sm text-center mb-4 bg-error/10 rounded-none py-2 px-4">
          {error}
        </div>
      )}

      {sent.length > 0 && (
        <div className="mb-4 space-y-1">
          {sent.map((entry) => (
            <p key={entry.email} className="text-success text-sm text-center">
              Invited {entry.firstName} ({entry.email})
            </p>
          ))}
        </div>
      )}

      <div>
        <p className="dc-label mb-3">To</p>
        <div className="space-y-3 bg-bg-card/60 border-[0.5px] border-border rounded-none p-4">
          {recipients.map((recipient, i) => (
            <div
              key={i}
              className="space-y-3 rounded-none border-[0.5px] border-border bg-bg-card/70 p-4"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={recipient.firstName}
                  onChange={(e) => updateRecipient(i, 'firstName', e.target.value)}
                  placeholder="First name"
                  className="w-1/2 bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <input
                  type="text"
                  value={recipient.lastName}
                  onChange={(e) => updateRecipient(i, 'lastName', e.target.value)}
                  placeholder="Last name"
                  className="w-1/2 bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={recipient.email}
                  onChange={(e) => updateRecipient(i, 'email', e.target.value)}
                  placeholder="Email"
                  className="flex-1 bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                />
                {recipients.length > 1 && (
                  <button
                    onClick={() => removeEmail(i)}
                    className="text-text-muted hover:text-text px-2 transition-colors cursor-pointer"
                  >
                    &times;
                  </button>
                )}
              </div>
              <label className="block text-xs text-text-muted">
                Why did this film make you think of them specifically? Write 2–3 sentences.
              </label>
              <textarea
                value={recipient.note}
                onChange={(e) => updateRecipient(i, 'note', e.target.value)}
                placeholder="A uniquely personal note from you is what makes this different from everything else in their inbox."
                rows={3}
                className="w-full bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end mt-4">
        {unlimited ? (
          <span className="text-text-muted text-xs">Unlimited shares</span>
        ) : (
          <span className="text-text-muted text-xs">
            {slotsRemaining} share{slotsRemaining !== 1 ? 's' : ''} remaining
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={
          sending ||
          recipients.every(
            (r) => !r.email.trim() && !r.firstName.trim()
          )
        }
        className="dc-btn dc-btn-accent w-full mt-4 min-h-[44px] touch-manipulation py-3 text-sm cursor-pointer"
      >
        {sending ? 'Sending...' : 'Send the invitations.'}
      </button>
    </div>
  )
}
