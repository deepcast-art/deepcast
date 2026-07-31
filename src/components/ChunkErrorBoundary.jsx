import { Component } from 'react'
import DeepcastLogo from './DeepcastLogo'
import { isChunkLoadError, shouldAutoReload, markReloadAttempt } from '../lib/chunkReloadGuard'

/**
 * The app-wide error boundary (2026-07-31) — the fix for the mobile
 * blank-screen incident (2026-07-28): with no boundary, a failed lazy
 * page-file fetch after a deploy unmounted the whole app to the bare ink
 * body background, permanently and silently.
 *
 * Behavior contract:
 * - A CHUNK-LOAD failure (stale deploy, dropped mobile fetch) triggers ONE
 *   automatic reload — a reload always fetches the current deploy's files,
 *   so the common case self-heals without the viewer seeing anything. The
 *   loop guard lives in src/lib/chunkReloadGuard.js (sessionStorage +
 *   history.state, so blocked storage can never cause a reload loop).
 * - A second failure inside the guard window, or any NON-chunk render error,
 *   renders the quiet on-brand error screen below with a manual reload
 *   button — never a blank page.
 *
 * Mounted around the router in main.jsx, so it also covers the video
 * player's lazily-loaded chunk (errors bubble to the nearest boundary —
 * this is the only one, by design: one recovery rule for the whole app).
 * No router hooks here — it must render even when the router itself failed.
 */
export default class ChunkErrorBoundary extends Component {
  state = { failed: false, reloading: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    if (isChunkLoadError(error) && shouldAutoReload()) {
      markReloadAttempt()
      this.setState({ reloading: true })
      window.location.reload()
      return
    }
    console.error('[app] render error (showing the error screen):', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    // Mid-reload: keep whatever is painted — the reload lands in a moment.
    if (this.state.reloading) return null
    return (
      <div className="relative min-h-svh bg-bg-page text-warm">
        <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-6 text-center dc-fade-in">
          <DeepcastLogo variant="wordmark" size="text-4xl" className="text-warm opacity-90" />
          <p className="mt-10 font-serif-v3 text-xl">Something went wrong on our side.</p>
          <p className="mt-3 max-w-sm font-serif-v3 text-sm italic text-warm/60">
            Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-8 min-h-[48px] cursor-pointer touch-manipulation border border-accent/60 px-8 py-3 font-sans text-[0.8125rem] uppercase tracking-[0.28em] text-accent transition-colors duration-300 hover:border-accent hover:bg-accent hover:text-ink focus-visible:border-accent focus-visible:bg-accent focus-visible:text-ink focus-visible:outline-none"
          >
            Reload the page
          </button>
        </div>
      </div>
    )
  }
}
