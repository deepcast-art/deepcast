import { DEV_HARNESS_ENABLED } from '../../lib/devHarness'

/**
 * THROWAWAY DEV HARNESS — sparse lineage-emblem composition candidates.
 * NOT a product surface; never part of a production bundle (lazy-loaded
 * behind DEV_HARNESS_ENABLED, same mechanism as DevHarness.jsx).
 *
 * Purpose (2026-07-25): the pass-it-on modal's emblem reads empty for
 * shallow chains. Before any redesign ships, the founder chooses between
 * RENDERED compositions — this page draws the founder-approved DIRECTION
 * at four chain depths, side by side, with mock names and zero real data:
 *
 *  - the emblem is styled as a FRAGMENT OF THE DASHBOARD CONSTELLATION
 *    (colors, line weights, node and label treatment lifted verbatim from
 *    ConstellationMap.jsx — if that file changes, re-lift);
 *  - the viewer's direct path (filmmaker → … → you) is highlighted gold;
 *    everything off-path is the constellation's dim-web treatment;
 *  - off-path forks are decorative context ONLY: unlabeled dots — never
 *    named, never invented people (in the real implementation the server's
 *    lineageForks booleans govern which forks exist);
 *  - at depth 1 the filmmaker carries a fork ABOVE as well (other branches
 *    of the film's spread), so the emblem never reads as two lonely dots.
 *
 * The live modal (LineageEmblem in ClaimWatch.jsx) is untouched — the real
 * implementation is its own session, after the founder picks.
 */

const LABEL_FONT = "'Phoenix', system-ui, sans-serif"

/* Verbatim constellation grammar (ConstellationMap.jsx). */
const DIM_EDGE = { stroke: 'rgba(234,231,224,0.16)', strokeWidth: 1, strokeDasharray: '2 5' }
const DIM_DOT = { fill: 'rgba(234,231,224,0.7)', r: 2.2 }
const GOLD_EDGE = { stroke: 'rgba(199,169,107,0.8)', strokeWidth: 1.4 }
const PATH_NODE = { fill: '#C7A96B', r: 3.5 }
const PATH_LABEL = { fill: 'rgba(199,169,107,0.9)', fontSize: 9, letterSpacing: 2 }
const YOU_NODE = { fill: '#D8C79A', r: 6 }
const YOU_HALO = { stroke: 'rgba(216,199,154,0.4)', r: 12 }
const YOU_LABEL = { fill: '#D8C79A', fontSize: 11.5, letterSpacing: 2 }
const NEXT_NODE = { stroke: '#C7A96B', strokeWidth: 1.2, r: 4.5 }
const NEXT_LABEL = { fill: '#D8C79A', fontSize: 9.5, letterSpacing: 2 }

function Label({ x, y, spec, children }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={spec.fill}
      fontSize={spec.fontSize}
      letterSpacing={spec.letterSpacing}
      style={{ fontFamily: LABEL_FONT, textTransform: 'uppercase' }}
    >
      {children}
    </text>
  )
}

/** The filmmaker as the constellation's central film node (camera glyph),
 *  at a smaller emblem scale (×0.62) so it reads as a fragment of the map. */
function FilmmakerNode({ x, y, name }) {
  const s = 0.62
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`}>
      <circle cx={x} cy={y} r="34" fill="rgba(199,169,107,0.09)" />
      <circle cx={x} cy={y} r="21" fill="none" stroke="rgba(216,199,154,0.75)" strokeWidth="1" />
      <rect x={x - 8.5} y={y - 5.5} width="11" height="11" rx="1.5" fill="none" stroke="#D8C79A" strokeWidth="1.2" />
      <path
        d={`M ${x + 3} ${y - 1.5} l 6 -3.5 v 10 l -6 -3.5 z`}
        fill="none"
        stroke="#D8C79A"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <text
        x={x}
        y={y + 42}
        textAnchor="middle"
        fill="#D8C79A"
        fontSize="11"
        letterSpacing="2.5"
        style={{ fontFamily: LABEL_FONT, textTransform: 'uppercase' }}
      >
        {name}
      </text>
      <text
        x={x}
        y={y + 57}
        textAnchor="middle"
        fill="#9A9890"
        fontSize="7.5"
        letterSpacing="3"
        style={{ fontFamily: LABEL_FONT }}
      >
        FILMMAKER
      </text>
    </g>
  )
}

/**
 * One emblem panel. `chain` = [{x, y, name}] from the filmmaker to the hand
 * before YOU; `you`/`next` = positions; `offPath` = decorative context —
 * faded, UNLABELED lines/dots (never people with names):
 * `{ lines: [[x1,y1,x2,y2]], dots: [[x,y]] }`.
 */
function EmblemPanel({ chain, you, next, offPath, entry }) {
  const filmmaker = chain[0]
  const named = chain.slice(1)
  const pathPoints = [...chain, you]
  return (
    <svg viewBox="0 0 420 240" className="block w-full" aria-hidden>
      {/* Off-path context first — under the gold. */}
      <g>
        {offPath.lines.map(([x1, y1, x2, y2], i) => (
          <line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} {...DIM_EDGE} />
        ))}
        {offPath.dots.map(([x, y], i) => (
          <circle key={`d${i}`} cx={x} cy={y} {...DIM_DOT} />
        ))}
      </g>

      {/* Entry stroke — the chain running deeper than the hands shown. */}
      {entry && (
        <line x1={entry[0]} y1={entry[1]} x2={filmmaker.x} y2={filmmaker.y} {...GOLD_EDGE} opacity="0.35" />
      )}

      {/* The direct path, highlighted. */}
      {pathPoints.slice(0, -1).map((p, i) => {
        const q = pathPoints[i + 1]
        return <line key={`g${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...GOLD_EDGE} />
      })}
      <line x1={you.x} y1={you.y} x2={next.x} y2={next.y} {...GOLD_EDGE} opacity="0.6" />

      <FilmmakerNode x={filmmaker.x} y={filmmaker.y} name={filmmaker.name} />

      {named.map((p) => (
        <g key={p.name}>
          <circle cx={p.x} cy={p.y} {...PATH_NODE} />
          <Label x={p.x} y={p.y - 10} spec={PATH_LABEL}>
            {p.name}
          </Label>
        </g>
      ))}

      <g>
        <circle cx={you.x} cy={you.y} {...YOU_NODE} />
        <circle cx={you.x} cy={you.y} fill="none" strokeWidth="1" {...YOU_HALO} />
        <Label x={you.x} y={you.y - 18} spec={YOU_LABEL}>
          YOU
        </Label>
      </g>

      <g>
        <circle cx={next.x} cy={next.y} fill="transparent" {...NEXT_NODE} />
        <Label x={next.x} y={next.y - 12} spec={NEXT_LABEL}>
          ?
        </Label>
      </g>
    </svg>
  )
}

/* Four hand-composed candidates. Mock first names only — no real data. */
const PANELS = [
  {
    key: 'depth-1',
    caption: 'Depth 1 — filmmaker → you. The fork ABOVE the filmmaker (other branches of the spread) keeps it from reading as two lonely dots.',
    chain: [{ x: 130, y: 150, name: 'Avery' }],
    you: { x: 265, y: 120 },
    next: { x: 355, y: 150 },
    offPath: {
      lines: [
        [130, 150, 90, 85],
        [90, 85, 55, 55],
        [90, 85, 125, 48],
        [130, 150, 185, 70],
        [185, 70, 230, 42],
      ],
      dots: [
        [55, 55],
        [125, 48],
        [230, 42],
        [40, 130],
      ],
    },
  },
  {
    key: 'depth-2',
    caption: 'Depth 2 — filmmaker → one hand → you.',
    chain: [
      { x: 85, y: 170, name: 'Avery' },
      { x: 190, y: 115, name: 'Mara' },
    ],
    you: { x: 285, y: 90 },
    next: { x: 365, y: 125 },
    offPath: {
      lines: [
        [85, 170, 60, 95],
        [60, 95, 95, 55],
        [190, 115, 235, 165],
      ],
      dots: [
        [95, 55],
        [45, 70],
        [235, 165],
      ],
    },
  },
  {
    key: 'depth-3',
    caption: 'Depth 3 — filmmaker → two hands → you.',
    chain: [
      { x: 70, y: 180, name: 'Avery' },
      { x: 155, y: 130, name: 'Priya' },
      { x: 245, y: 100, name: 'Jonas' },
    ],
    you: { x: 325, y: 75 },
    next: { x: 390, y: 115 },
    offPath: {
      lines: [
        [70, 180, 45, 105],
        [45, 105, 75, 62],
        [155, 130, 185, 190],
        [245, 100, 290, 155],
      ],
      dots: [
        [75, 62],
        [30, 80],
        [185, 190],
        [290, 155],
      ],
    },
  },
  {
    key: 'depth-8',
    caption: 'Depth ~8 — the current design’s home territory: the last three hands named, the entry stroke implying the rest.',
    chain: [
      { x: 95, y: 175, name: 'Avery' },
      { x: 180, y: 125, name: 'Dev' },
      { x: 260, y: 95, name: 'Lena' },
    ],
    you: { x: 335, y: 70 },
    next: { x: 395, y: 110 },
    entry: [25, 215],
    offPath: {
      lines: [
        [95, 175, 70, 100],
        [180, 125, 215, 185],
        [215, 185, 265, 200],
        [260, 95, 300, 150],
      ],
      dots: [
        [70, 100],
        [265, 200],
        [300, 150],
        [45, 55],
        [350, 190],
      ],
    },
  },
]

export default function DevEmblemHarness() {
  // Defense in depth: the route is already gated, but never render otherwise.
  if (!DEV_HARNESS_ENABLED) return null

  return (
    <div className="min-h-dvh bg-bg-page p-6 text-warm">
      <div className="mx-auto max-w-5xl">
        <p className="mb-1 font-sans text-xs uppercase tracking-widest text-error">
          THROWAWAY DEV HARNESS — not in production
        </p>
        <h1 className="mb-2 font-serif-v3 text-2xl italic">
          Lineage emblem — sparse-composition candidates
        </h1>
        <p className="mb-8 max-w-2xl font-sans text-sm text-warm/60">
          Four chain depths, mock names, zero real data. Styling is lifted verbatim from the
          dashboard constellation (ConstellationMap.jsx): gold direct path, dim unlabeled
          context, same nodes and labels. The live pass-it-on modal is untouched.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {PANELS.map((p) => (
            <figure key={p.key} data-panel={p.key} className="border border-mist/[0.12] bg-ink-2 p-3">
              <EmblemPanel
                chain={p.chain}
                you={p.you}
                next={p.next}
                offPath={p.offPath}
                entry={p.entry}
              />
              <figcaption className="mt-2 px-1 font-sans text-xs leading-relaxed text-warm/55">
                {p.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}
