/**
 * Deepcast wordmark — DM Serif Display 400, −0.02em (brand hero / wordmark).
 */
export default function DeepcastLogo({
  variant = 'ink',
  className = '',
  title = 'Deepcast',
}) {
  const toneClass =
    variant === 'accent'
      ? 'text-accent'
      : variant === 'warm'
        ? 'text-warm'
        : 'text-ink'

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
        fontFamily="'DM Serif Display', Georgia, serif"
        fontSize="110"
        fontWeight="400"
        fill="currentColor"
        textAnchor="middle"
        letterSpacing="-0.02em"
      >
        Deepcast
      </text>
    </svg>
  )
}
