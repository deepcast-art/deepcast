/**
 * Landing-page entry control for the invite flow.
 *
 * - No session  → an underline-only email field (faded "Enter email" hint, typed text in the
 *   existing amber/beige token #b1a180) above the unchanged "Open your invitation" submit.
 * - Has session → the original "Enter / Open your invitation" button, untouched.
 *
 * No new colors or visual styles are introduced — only the existing tokens plus a thin underline.
 */
export default function InviteEmailEntry({
  showEmailField,
  emailInput,
  setEmailInput,
  emailError,
  emailSuggestion,
  onAcceptEmailSuggestion,
  emailSubmitting,
  onSubmit,
  size = 'lg',
  revealUp = false,
  transitionDelay,
}) {
  const titleSize = size === 'sm' ? 'text-xl' : 'text-2xl'
  const reveal = revealUp ? 'reveal-up' : ''
  const style = transitionDelay ? { transitionDelay } : undefined

  const submitLabel = (
    <div className="relative w-fit overflow-hidden py-1">
      <span className={`font-serif-v3 ${titleSize} italic text-[#dddddd]`}>
        {emailSubmitting ? 'One moment…' : 'Open your invitation'}
      </span>
      <div className="absolute bottom-0 left-0 h-[0.5px] w-full -translate-x-full bg-[#b1a180] transition-transform duration-[600ms] ease-out group-hover:translate-x-0" />
    </div>
  )

  if (!showEmailField) {
    return (
      <button
        type="button"
        onClick={onSubmit}
        className={`group flex cursor-pointer flex-col items-center gap-3 border-0 bg-transparent p-0 touch-manipulation ${reveal}`}
        style={style}
      >
        <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-[#b1a180] transition-colors duration-300 group-hover:text-[#dddddd]">
          Enter
        </span>
        {submitLabel}
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className={`flex w-full max-w-[260px] flex-col items-center gap-3 ${reveal}`}
      style={style}
    >
      {/* Faded hint — same type as the "ENTER" label, lower opacity. Replaces it as the field hint. */}
      <span className="font-sans text-[9px] uppercase tracking-[0.3em] text-[#b1a180]/45">
        Enter email
      </span>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        aria-label="Email address"
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        className="w-full border-0 border-b-[0.5px] border-[#b1a180]/30 bg-transparent pb-1.5 text-center font-sans text-sm tracking-[0.06em] text-[#b1a180] focus:border-[#b1a180]/70 focus:outline-none transition-colors"
      />
      {emailError && (
        <span className="font-sans text-[9px] uppercase tracking-[0.18em] text-[#dddddd]/45">
          {emailError}
        </span>
      )}
      {emailSuggestion && (
        <button
          type="button"
          onClick={onAcceptEmailSuggestion}
          className="font-sans text-[9px] tracking-[0.06em] text-[#dddddd]/55 transition-colors hover:text-[#b1a180]"
        >
          Did you mean <span className="text-[#b1a180]">{emailSuggestion}</span>?
        </button>
      )}
      <button
        type="submit"
        disabled={emailSubmitting}
        className="group mt-1 flex cursor-pointer flex-col items-center border-0 bg-transparent p-0 touch-manipulation disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  )
}
