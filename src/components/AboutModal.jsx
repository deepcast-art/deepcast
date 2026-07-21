/**
 * V5 dashboard About popup — opens from the sidebar / mobile menu "About
 * Deepcast" entry so viewers never navigate away from their dashboard.
 * Same modal chrome as ShareLinkModal; the copy itself lives in
 * AboutContent (shared with the /about page, which stays live for
 * direct links).
 */
import AboutContent from './AboutContent'

export default function AboutModal({ open, onClose }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/90 p-5 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="About Deepcast"
    >
      <div className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto border border-mist/[0.16] bg-ink-2 p-8 sm:p-10">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 min-h-[44px] min-w-[44px] touch-manipulation font-sans text-[0.6875rem] uppercase tracking-[0.22em] text-smoke transition-colors hover:text-mist"
        >
          Close
        </button>

        <p className="mb-7 font-sans text-[0.625rem] uppercase tracking-[0.3em] text-smoke">
          About Deepcast
        </p>

        <AboutContent />
      </div>
    </div>
  )
}
