import { Link } from 'react-router-dom'
import DeepcastLogo from '../components/DeepcastLogo'

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
          <h1 className="mt-3 text-xl font-display sm:text-2xl">About Deepcast</h1>
        </div>

        <div className="space-y-8 animate-fade-in animate-delay-200">
          <section>
            <h2 className="font-display text-lg text-text">What is Deepcast?</h2>
            <p className="mt-2 text-[17px] leading-relaxed text-text">
              Deepcast is a humanity-oriented film distribution platform with three principles:
            </p>
            <ol className="mt-2 space-y-2 text-[17px] leading-relaxed text-text">
              <li>1) Films spread privately by real humans only. No algorithms.</li>
              <li>2) Films won’t be seen by more people unless existing viewers choose to share</li>
              <li>3) All shares should be thoughtful and highly curated</li>
            </ol>
          </section>

          <section>
            <h2 className="font-display text-lg text-text">Why does it exist?</h2>
            <p className="mt-2 text-[17px] leading-relaxed text-text">
              I’m lifelong filmmaker who’s been focused on crafting substantive stories. When I
              worked at Jubilee, we grew a YouTube channel to 5M+ subscribers and over a billion
              views — but not without a cost. I watched how over time the company drifted in
              mission due to the YouTube algorithms, tilting everything towards more and more
              attention extraction, clickbait, and spectacle. In this age of increasing noise and
              fog, Deepcast is an attempt to create a platform optimized for humanity, connection,
              and substance rather than just views. To go from broadcasting to ‘deepcasting’.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg text-text">Who is it for?</h2>
            <p className="mt-2 text-[17px] leading-relaxed text-text">
              Filmmakers, creators, storytellers who want to build an army of their true fans, are
              tired of the gatekeepers &amp; algorithms &amp; and not having a direct relationship
              with their audience. Viewers who want more meaningful viewing experience customized
              for them, more substantive stories, meaningful community, and deeper relationships
              with their favorite storytellers.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg text-text">Who made this?</h2>
            <p className="mt-2 text-[17px] leading-relaxed text-text">
              I did — Ien Chi (
              <a
                href="https://www.ienchi.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent transition-colors hover:text-accent-hover"
              >
                https://www.ienchi.com
              </a>
              ). This is an early MVP, and I&apos;m looking for help bringing it to life. If
              you&apos;re a filmmaker, collaborator, advisor, investor, engineer with taste,
              designer, curator, or community builder — or none of these, but something here moved
              you — write me:{' '}
              <a
                href="mailto:ien.chi96@gmail.com"
                className="text-accent transition-colors hover:text-accent-hover"
              >
                ien.chi96@gmail.com
              </a>
              . I read every message myself.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
