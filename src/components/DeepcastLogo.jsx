/**
 * Deepcast wordmark — lowercase “deepcast” in Phoenix Semi Bold,
 * or legacy vector wordmark for serif/legacy variants.
 */
export default function DeepcastLogo({
  variant = 'wordmark',
  className = '',
  size = null,
  title = 'Deepcast',
}) {
  if (variant === 'serif' || variant === 'legacy') {
    const toneClass =
      variant === 'accent'
        ? 'text-accent'
        : variant === 'warm'
          ? 'text-warm'
          : 'text-text'

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 800 180"
        className={`h-8 w-auto shrink-0 ${toneClass} ${className}`.trim()}
        role="img"
        aria-label={title}
      >
        <title>{title}</title>
        <text
          x="400"
          y="140"
          fontFamily="'Phoenix', 'Helvetica Neue', Helvetica, sans-serif"
          fontSize="110"
          fontWeight="600"
          fill="currentColor"
          textAnchor="middle"
          letterSpacing="-0.02em"
        >
          deepcast
        </text>
      </svg>
    )
  }

  const onLight = variant === 'on-light'

  return (
    <span
      role="img"
      aria-label={title}
      className={[
        'inline-block shrink-0 font-display font-semibold lowercase leading-none tracking-[-0.02em]',
        size ?? 'text-8xl',
        onLight ? 'text-[#080c18]' : 'text-[#d1d1d1]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      deepcast
    </span>
  )
}
