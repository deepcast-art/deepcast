import { Link } from 'react-router-dom'
import DeepcastLogo from '../components/DeepcastLogo'
import AboutContent from '../components/AboutContent'

export default function About() {
  return (
    <div className="min-h-dvh px-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-6 sm:py-12">
      <div className="mx-auto min-w-0 max-w-2xl">
        {/* Header */}
        <div className="mb-8 animate-fade-in">
          <Link to="/" className="inline-flex transition-opacity hover:opacity-80">
            <DeepcastLogo variant="ink" className="h-7 sm:h-8" />
          </Link>
          <Link
            to="/dashboard"
            className="mt-5 mb-1 flex items-center gap-2 text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0 opacity-70"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to dashboard
          </Link>
          <h1 className="mt-3 font-serif-v3 text-2xl italic text-accent sm:text-3xl">About Deepcast</h1>
        </div>

        <div className="animate-fade-in animate-delay-200">
          <AboutContent />
        </div>
      </div>
    </div>
  )
}
