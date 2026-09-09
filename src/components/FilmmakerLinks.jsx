/**
 * The filmmaker's two link icons (founder direction 2026-09-09): Instagram
 * and a globe for the website — 16px inline SVGs, hairline stroke 1.2,
 * currentColor muted, warm on hover, opening in a new tab with rel
 * noopener. No third-party widget, no tracking. Rendered above the story
 * header's eyebrow on the watch page and beside the founder's name on the
 * About page. URLs come from src/content/filmStory.js.
 */
const ICON_CLASS =
  'inline-flex h-4 w-4 items-center justify-center text-muted transition-colors hover:text-warm focus-visible:text-warm focus-visible:outline-none'

export default function FilmmakerLinks({ links, className = '' }) {
  if (!links || (!links.instagram && !links.website)) return null
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} data-filmmaker-links>
      {links.instagram && (
        <a
          href={links.instagram}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram"
          className={ICON_CLASS}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-4 w-4"
          >
            <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" />
            <circle cx="8" cy="8" r="3" />
            <circle cx="11.6" cy="4.4" r="0.5" fill="currentColor" stroke="none" />
          </svg>
        </a>
      )}
      {links.website && (
        <a
          href={links.website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Website"
          className={ICON_CLASS}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-4 w-4"
          >
            <circle cx="8" cy="8" r="6.5" />
            <ellipse cx="8" cy="8" rx="2.6" ry="6.5" />
            <line x1="1.5" y1="8" x2="14.5" y2="8" />
          </svg>
        </a>
      )}
    </span>
  )
}
