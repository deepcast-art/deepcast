import { Fragment, useEffect, useState } from 'react'
import { buildLineageChain } from '../lib/lineageThread'

/** Chain collapse thresholds (invite-v2, 2026-07-18): wide screens show up
 *  to 5 names before collapsing the middle; phones 3 (a measured full
 *  4-name vertical chain overflowed 390×844). The same rule on every
 *  surface that draws the chain. */
const CHAIN_THRESHOLD_WIDE = 5
const CHAIN_THRESHOLD_NARROW = 3
const CHAIN_MEDIA_QUERY = '(min-width: 640px)'

/**
 * The lineage chain — the network idea at a whisper: first names joined by
 * arrows (→ on wide screens, ↓ stacked on phones), the film's creator first
 * with a small "(filmmaker)" caption (parentheses: founder decision
 * 2026-09-09), ending in "you". ONE component for the landing letter and,
 * since 2026-09-09, the watch page's rail — same rule (buildLineageChain),
 * same type, same arrows. `next` appends one more arrow to a muted label
 * after "you" (the rail's "Who’s next?"); `align` is the row's alignment.
 */
export default function LineageChain({ names, senderIsCreator, next = null, align = 'center' }) {
  const [expanded, setExpanded] = useState(false)
  const [wide, setWide] = useState(() => window.matchMedia(CHAIN_MEDIA_QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(CHAIN_MEDIA_QUERY)
    const onChange = (e) => setWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const items = buildLineageChain(names, {
    collapseAfter: wide ? CHAIN_THRESHOLD_WIDE : CHAIN_THRESHOLD_NARROW,
    expanded,
    senderIsCreator,
  })
  if (!items.length) return null

  const start = align === 'start'
  const arrow = (key) => (
    <span key={key} aria-hidden className="font-light tracking-normal text-accent/65">
      {wide ? '→' : '↓'}
    </span>
  )

  return (
    <div
      data-lineage-chain
      className={`flex font-sans text-[0.8125rem] uppercase leading-none tracking-[0.2em] text-accent ${
        wide
          ? `flex-row flex-wrap items-center gap-x-[1.125rem] gap-y-5 ${start ? 'justify-start' : 'justify-center'}`
          : `flex-col gap-1.5 ${start ? 'items-start' : 'items-center'}`
      }`}
    >
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && arrow(`arrow-${i}`)}
          {item.type === 'collapsed' ? (
            /* Expanding may push content below the fold — acceptable only
               after this deliberate tap, never in the default state. */
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="cursor-pointer border-none bg-transparent p-0 font-sans text-[0.8125rem] uppercase tracking-[0.2em] text-muted transition-colors hover:text-warm focus-visible:text-warm focus-visible:outline-none"
              aria-label={`Show all ${item.count} people this film passed through`}
            >
              ⋯ {item.count} others ⋯
            </button>
          ) : item.type === 'you' ? (
            <span className="text-paper/90">you</span>
          ) : item.filmmaker ? (
            /* Horizontal rows: the caption hangs below (absolute) so the
               name stays on the row's shared baseline. Vertical stacks:
               in-flow, so the ↓ beneath moves down to make room. */
            /* Centred under the name on the landing letter; flush with the
               left edge in the rail's start-aligned mode, so the caption
               never hangs past the column. */
            wide ? (
              <span className="relative inline-block">
                <span>{item.label}</span>
                <span
                  aria-hidden
                  className={`absolute top-full mt-1 whitespace-nowrap text-[0.5625rem] tracking-[0.3em] text-muted ${
                    start ? 'left-0' : 'left-1/2 -translate-x-1/2'
                  }`}
                >
                  (filmmaker)
                </span>
              </span>
            ) : (
              <span className={`inline-flex flex-col gap-1 ${start ? 'items-start' : 'items-center'}`}>
                <span>{item.label}</span>
                <span aria-hidden className="text-[0.5625rem] tracking-[0.3em] text-muted">
                  (filmmaker)
                </span>
              </span>
            )
          ) : (
            <span>{item.label}</span>
          )}
        </Fragment>
      ))}
      {next && (
        <>
          {arrow('arrow-next')}
          <span className="text-muted">{next}</span>
        </>
      )}
    </div>
  )
}
