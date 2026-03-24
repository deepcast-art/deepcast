import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

export { parseInviteRecipientForPrefill } from '../lib/invitePrefill'

export default function InviteForm({
  filmId,
  filmTitle,
  filmDescription,
  senderName,
  senderEmail,
  senderId,
  maxInvites = 3,
  unlimited = false,
  onInviteSent,
  showSenderFields = false,
  /** Prefill first "To" row (e.g. film invite receiver’s name + email) */
  initialRecipient = null,
  /** Labels readable on dark screening surfaces (e.g. paused share column) */
  embedOnDarkBackground = false,
  passwordPlaceholder = 'Create password',
  noteLabel = 'Why did this film make you think of them specifically? Write 2–3 sentences.',
  notePlaceholder = 'A uniquely personal note from you is what makes this different from everything else in their inbox.',
  /** Wait before calling `onInviteSent` so the success message stays visible (ms). Use `0` for immediate. */
  delayOnInviteSentMs = 2200,
}) {
  const { signUp, signIn } = useAuth()
  const [recipients, setRecipients] = useState(() => [
    {
      firstName: initialRecipient?.firstName?.trim() || '',
      lastName: initialRecipient?.lastName?.trim() || '',
      email: initialRecipient?.email?.trim() || '',
      note: '',
    },
  ])
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState([])
  const [error, setError] = useState('')
  const [senderFirstNameInput, setSenderFirstNameInput] = useState(
    senderName?.trim().split(/\s+/)[0] || ''
  )
  const [senderLastNameInput, setSenderLastNameInput] = useState(
    senderName?.trim().split(/\s+/).slice(1).join(' ') || ''
  )
  const [senderEmailInput, setSenderEmailInput] = useState(senderEmail || '')
  const [senderPasswordInput, setSenderPasswordInput] = useState('')
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

  const addEmail = () => {
    if (unlimited || recipients.length < slotsRemaining) {
      setRecipients([...recipients, { firstName: '', lastName: '', email: '', note: '' }])
    }
  }

  const updateRecipient = (index, key, value) => {
    const updated = [...recipients]
    updated[index] = { ...updated[index], [key]: value }
    setRecipients(updated)
  }

  const removeEmail = (index) => {
    setRecipients(recipients.filter((_, i) => i !== index))
  }

  const handleSend = async () => {
    const validRecipients = recipients.filter(
      (r) =>
        r.email.trim() &&
        r.email.includes('@') &&
        r.firstName.trim()
    )
    if (validRecipients.length === 0) {
      setError('Please add a first name and valid email for each invite.')
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

    if (showSenderFields) {
      if (
        !senderFirstNameInput.trim() ||
        !senderLastNameInput.trim() ||
        !senderEmailInput.trim() ||
        !senderEmailInput.includes('@') ||
        !senderPasswordInput.trim()
      ) {
        setError('Please enter your name, email, and password.')
        return
      }
    }

    setSending(true)
    setError('')

    try {
      const resolvedSenderName =
        [senderFirstNameInput, senderLastNameInput].filter(Boolean).join(' ').trim() || senderName
      const resolvedSenderEmail = senderEmailInput.trim() || senderEmail
      const appUrl = window?.location?.origin || null
      let resolvedSenderId = senderId || null

      if (showSenderFields) {
        try {
          const signInResult = await signIn(resolvedSenderEmail, senderPasswordInput)
          resolvedSenderId = resolvedSenderId || signInResult?.user?.id || signInResult?.profile?.id
        } catch (signInError) {
          try {
            const signUpResult = await signUp(
              resolvedSenderEmail,
              senderPasswordInput,
              resolvedSenderName,
              'viewer',
              senderFirstNameInput.trim(),
              senderLastNameInput.trim()
            )
            resolvedSenderId = resolvedSenderId || signUpResult?.user?.id || null
          } catch (signUpError) {
            setError(signUpError.message || signInError.message)
            setSending(false)
            return
          }
        }
      }

      for (const recipient of validRecipients) {
        const recipientNote = recipient.note.trim()
        const recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ')
        await api.sendInvite(
          filmId,
          recipient.email.trim(),
          recipientName.trim(),
          resolvedSenderName,
          resolvedSenderId,
          resolvedSenderEmail,
          recipientNote,
          appUrl
        )
        setSent((prev) => [...prev, recipient])
      }
      setRecipients([{ firstName: '', lastName: '', email: '', note: '' }])

      const msg =
        validRecipients.length === 1
          ? `Invitation sent to ${validRecipients[0].firstName.trim()}. They’ll receive an email with a private screening link.`
          : `${validRecipients.length} invitations sent. Each person will receive an email with a private screening link.`
      setSuccessMessage(msg)

      const payload = {
        senderName: resolvedSenderName,
        senderEmail: resolvedSenderEmail,
        recipients: validRecipients,
      }
      if (onInviteSent) {
        const delay = typeof delayOnInviteSentMs === 'number' ? delayOnInviteSentMs : 2200
        if (delay <= 0) {
          onInviteSentTimeoutRef.current = setTimeout(() => {
            onInviteSent(payload)
            onInviteSentTimeoutRef.current = null
          }, 0)
        } else {
          onInviteSentTimeoutRef.current = setTimeout(() => {
            onInviteSent(payload)
            onInviteSentTimeoutRef.current = null
          }, delay)
        }
      }
    } catch (err) {
      console.error('Invite send error:', err)
      setError(err.message || 'Failed to send invitation. Please try again.')
    } finally {
      setSending(false)
    }
  }

  /** Invites left to send (do not subtract draft rows — only completed sends count). */
  const slotsRemaining = unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, maxInvites - sent.length)

  if (!unlimited && sent.length >= maxInvites) {
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

      {showSenderFields && (
        <div className="mb-6">
          <p
            className={`dc-label mb-3 ${embedOnDarkBackground ? 'text-warm/75' : ''}`}
          >
            From
          </p>
          <div className="space-y-3 bg-bg-card/60 border-[0.5px] border-border rounded-none p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={senderFirstNameInput}
                onChange={(e) => setSenderFirstNameInput(e.target.value)}
                placeholder="First name"
                className="w-1/2 bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              />
              <input
                type="text"
                value={senderLastNameInput}
                onChange={(e) => setSenderLastNameInput(e.target.value)}
                placeholder="Last name"
                className="w-1/2 bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <input
              type="email"
              value={senderEmailInput}
              onChange={(e) => setSenderEmailInput(e.target.value)}
              placeholder="Email"
              className="w-full bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
            />
            <input
              type="password"
              value={senderPasswordInput}
              onChange={(e) => setSenderPasswordInput(e.target.value)}
              placeholder={passwordPlaceholder}
              minLength={6}
              className="w-full bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
            />
          </div>
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
        <p className={`dc-label mb-3 ${embedOnDarkBackground ? 'text-warm/75' : ''}`}>To</p>
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
                  className="w-1/3 bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <input
                  type="text"
                  value={recipient.lastName}
                  onChange={(e) => updateRecipient(i, 'lastName', e.target.value)}
                  placeholder="Last name"
                  className="w-1/3 bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <input
                  type="email"
                  value={recipient.email}
                  onChange={(e) => updateRecipient(i, 'email', e.target.value)}
                  placeholder="Email"
                  className="w-1/3 bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
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
                {noteLabel}
              </label>
              <textarea
                value={recipient.note}
                onChange={(e) => updateRecipient(i, 'note', e.target.value)}
                placeholder={notePlaceholder}
                rows={3}
                className="w-full bg-bg-card border-[0.5px] border-border rounded-none px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        {(unlimited || recipients.length < slotsRemaining) && (
          <button
            onClick={addEmail}
            className="text-accent text-sm hover:text-accent-hover transition-colors cursor-pointer"
          >
            + Add another
          </button>
        )}
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
          ) ||
          (showSenderFields &&
            (!senderFirstNameInput.trim() ||
              !senderLastNameInput.trim() ||
              !senderEmailInput.trim() ||
              !senderEmailInput.includes('@') ||
              !senderPasswordInput.trim()))
        }
        className="dc-btn dc-btn-accent w-full mt-4 py-3 text-sm cursor-pointer"
      >
        {sending ? 'Sending...' : 'Send the invitations.'}
      </button>
    </div>
  )
}
