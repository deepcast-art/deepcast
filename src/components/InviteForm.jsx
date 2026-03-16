import { useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

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
}) {
  const { signUp, signIn } = useAuth()
  const [recipients, setRecipients] = useState([
    { firstName: '', lastName: '', email: '', note: '' },
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

  const addEmail = () => {
    if (unlimited || recipients.length < maxInvites) {
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
              'viewer'
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
      if (onInviteSent) {
        onInviteSent({ senderName: resolvedSenderName, senderEmail: resolvedSenderEmail })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const remainingInvites = maxInvites - sent.length

  if (!unlimited && remainingInvites <= 0) {
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
      {error && (
        <div className="text-error text-sm text-center mb-4 bg-error/10 rounded-lg py-2 px-4">
          {error}
        </div>
      )}

      {showSenderFields && (
        <div className="mb-6">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-3">From</p>
          <div className="space-y-3 bg-bg-card/60 border border-border rounded-2xl p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={senderFirstNameInput}
                onChange={(e) => setSenderFirstNameInput(e.target.value)}
                placeholder="First name"
                className="w-1/2 bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              />
              <input
                type="text"
                value={senderLastNameInput}
                onChange={(e) => setSenderLastNameInput(e.target.value)}
                placeholder="Last name"
                className="w-1/2 bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <input
              type="email"
              value={senderEmailInput}
              onChange={(e) => setSenderEmailInput(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
            />
            <input
              type="password"
              value={senderPasswordInput}
              onChange={(e) => setSenderPasswordInput(e.target.value)}
              placeholder="Password"
              minLength={6}
              className="w-full bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
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
        <p className="text-text-muted text-xs uppercase tracking-wider mb-3">To</p>
        <div className="space-y-3 bg-bg-card/60 border border-border rounded-2xl p-4">
          {recipients.map((recipient, i) => (
            <div key={i} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={recipient.firstName}
                  onChange={(e) => updateRecipient(i, 'firstName', e.target.value)}
                  placeholder="First name"
                  className="w-1/3 bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <input
                  type="text"
                  value={recipient.lastName}
                  onChange={(e) => updateRecipient(i, 'lastName', e.target.value)}
                  placeholder="Last name"
                  className="w-1/3 bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
                />
                <input
                  type="email"
                  value={recipient.email}
                  onChange={(e) => updateRecipient(i, 'email', e.target.value)}
                  placeholder="friend@example.com"
                  className="w-1/3 bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
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
                Why did this film make you think of them? Write 1-3 sentences.
              </label>
              <textarea
                value={recipient.note}
                onChange={(e) => updateRecipient(i, 'note', e.target.value)}
                placeholder="Add a short note (1-3 sentences)..."
                rows={3}
                className="w-full bg-bg-card border border-border rounded-lg px-4 py-3 text-text text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        {(unlimited || recipients.length < remainingInvites) && (
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
            {remainingInvites} share{remainingInvites !== 1 ? 's' : ''} remaining
          </span>
        )}
      </div>

      <button
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
        className="w-full mt-4 bg-accent text-bg font-medium rounded-lg py-3 text-sm hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
      >
        {sending ? 'Sending...' : 'Send the invitations.'}
      </button>
    </div>
  )
}
