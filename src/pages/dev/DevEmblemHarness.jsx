import { DEV_HARNESS_ENABLED } from '../../lib/devHarness'

/**
 * THROWAWAY DEV HARNESS v2 — lineage-emblem TREE-GRAMMAR candidates.
 * NOT a product surface; never part of a production bundle (lazy-loaded
 * behind DEV_HARNESS_ENABLED, same mechanism as DevHarness.jsx).
 *
 * v2 (2026-07-25, founder-directed): the composition is a BRANCHING TREE
 * with a direction of growth — one origin (the filmmaker) at the left,
 * the network growing rightward, arms forking organically with buds top
 * and bottom. Left-to-right reads as time. ONE tree grammar, four growth
 * stages: every panel renders the SAME per-generation branch templates —
 * each depth is the same underlying form one generation further grown,
 * not four unrelated drawings.
 *
 * LINE GRAMMAR (founder-stamped 2026-07-25):
 *  - filmmaker → … → YOU (realized path): SOLID GOLD;
 *  - YOU → "?" (the unminted next ticket): DOTTED GOLD;
 *  - all off-path branches and nodes: DOTTED GRAY, faded, UNLABELED —
 *    never invented people (real forks come from lineageForks server
 *    booleans in the eventual implementation).
 *  Color carries whose story it is (gold = yours); texture carries what
 *  is real yet (solid = happened, dotted = not yet). The "?" is the only
 *  node on a gold dotted line: hollow, slightly larger, gold-ringed.
 *
 * Depth 4+ renders AS the mature three-generation form with compressed
 * ancestry entering from the left as a receding line — shown BOTH ways
 * (bare, and carrying the existing "⋯ N hands ⋯" collapse label) for the
 * founder to choose.
 *
 * Visual vocabulary is the dashboard constellation's, verbatim from
 * ConstellationMap.jsx (if that file changes, re-lift): the emblem is one
 * limb of that star system. The live modal (LineageEmblem in
 * ClaimWatch.jsx) is untouched — implementation is its own session.
 */

const LABEL_FONT = "'Phoenix', system-ui, sans-serif"

/* Verbatim constellation grammar (ConstellationMap.jsx). */
const GOLD = 'rgba(199,169,107,0.8)'
const GRAY_EDGE = { stroke: 'rgba(234,231,224,0.16)', strokeWidth: 1, strokeDasharray: '2 5' }
const GRAY_DOT = { fill: 'rgba(234,231,224,0.7)', r: 2.2 }
const PATH_NODE = { fill: '#C7A96B', r: 3.5 }
const PATH_LABEL = { fill: 'rgba(199,169,107,0.9)', fontSize: 9, letterSpacing: 2 }
const YOU_LABEL = { fill: '#D8C79A', fontSize: 11.5, letterSpacing: 2 }
const NEXT_LABEL = { fill: '#D8C79A', fontSize: 9.5, letterSpacing: 2 }

/**
 * THE TREE GRAMMAR — one set of per-generation branch templates, reused
 * by every stage. A template lists this generation's off-path buds as
 * offsets from the gold node: `d` = the bud dot, optional `sub` = a
 * second-order bud growing onward from it. All offsets grow rightward
 * (dx > 0) — time flows left to right; buds alternate above and below
 * the arm (asymmetric, like a branch growing).
 */
const TEMPLATES = [
  // G0 — the filmmaker's other branches: a canopy above, one limb below.
  { buds: [{ d: [35, -55], sub: [75, -78] }, { d: [48, 42], sub: [95, 58] }] },
  // G1 — the first hand's other shares: a limb below with growth, one up.
  { buds: [{ d: [30, 48], sub: [68, 70] }, { d: [38, -42] }] },
  // G2 — up with growth, one down.
  { buds: [{ d: [34, -44], sub: [72, -58] }, { d: [26, 52] }] },
  // G3 — a single young bud below.
  { buds: [{ d: [32, 44] }] },
]

function Label({ x, y, spec, upper = true, children }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={spec.fill}
      fontSize={spec.fontSize}
      letterSpacing={spec.letterSpacing}
      style={{ fontFamily: LABEL_FONT, ...(upper ? { textTransform: 'uppercase' } : {}) }}
    >
      {children}
    </text>
  )
}

/** The filmmaker as the constellation's central film node (camera glyph),
 *  at emblem scale (×0.62) — the origin the tree grows from. */
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

/** One generation's off-path growth: dotted-gray limbs to unlabeled dots. */
function Buds({ node, gen }) {
  const t = TEMPLATES[Math.min(gen, TEMPLATES.length - 1)]
  return (
    <g>
      {t.buds.map((b, i) => {
        const bx = node.x + b.d[0]
        const by = node.y + b.d[1]
        return (
          <g key={i}>
            <line x1={node.x} y1={node.y} x2={bx} y2={by} {...GRAY_EDGE} />
            <circle cx={bx} cy={by} {...GRAY_DOT} />
            {b.sub && (
              <>
                <line x1={bx} y1={by} x2={node.x + b.sub[0]} y2={node.y + b.sub[1]} {...GRAY_EDGE} />
                <circle cx={node.x + b.sub[0]} cy={node.y + b.sub[1]} {...GRAY_DOT} />
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}

/**
 * One growth stage of the tree. `chain` = gold nodes from the filmmaker
 * through the hands (YOU excluded); `receding` renders the FIRST gold
 * segment as compressed ancestry (long, fading toward the origin), with
 * an optional `hiddenHands` count carrying the "⋯ N hands ⋯" collapse
 * grammar (numerals always).
 */
function TreePanel({ chain, you, next, receding = false, hiddenHands = null }) {
  const filmmaker = chain[0]
  const named = chain.slice(1)
  const goldPoints = [...chain, you]
  const mid = {
    x: (chain[0].x + chain[1]?.x) / 2 || 0,
    y: (chain[0].y + chain[1]?.y) / 2 || 0,
  }
  return (
    <svg viewBox="0 0 420 240" className="block w-full" aria-hidden>
      {/* Off-path growth first, under the gold — the same generation
          templates at every stage (the one tree grammar). */}
      {chain.map((p, g) => (
        <Buds key={`b${g}`} node={p} gen={g} />
      ))}

      {/* The realized path: SOLID GOLD. A receding first segment carries
          the compressed ancestry at reduced presence. */}
      {goldPoints.slice(0, -1).map((p, i) => {
        const q = goldPoints[i + 1]
        const isEntry = receding && i === 0
        return (
          <line
            key={`g${i}`}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke={GOLD}
            strokeWidth="1.4"
            opacity={isEntry ? 0.4 : 1}
          />
        )
      })}
      {receding && hiddenHands != null && (
        <Label x={mid.x} y={mid.y - 12} spec={{ fill: 'rgba(234,231,224,0.45)', fontSize: 8.5, letterSpacing: 1.5 }} upper={false}>
          {`⋯ ${hiddenHands} hands ⋯`}
        </Label>
      )}

      {/* The unminted next ticket: DOTTED GOLD to the growing tip. */}
      <line
        x1={you.x}
        y1={you.y}
        x2={next.x}
        y2={next.y}
        stroke={GOLD}
        strokeWidth="1.4"
        strokeDasharray="2 4"
      />

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
        <circle cx={you.x} cy={you.y} r="6" fill="#D8C79A" />
        <circle cx={you.x} cy={you.y} r="12" fill="none" stroke="rgba(216,199,154,0.4)" strokeWidth="1" />
        <Label x={you.x} y={you.y - 18} spec={YOU_LABEL}>
          YOU
        </Label>
      </g>

      {/* The growing tip: hollow, slightly larger than off-path dots,
          gold-ringed — the only node on a gold dotted line. */}
      <g>
        <circle cx={next.x} cy={next.y} r="4.5" fill="transparent" stroke="#C7A96B" strokeWidth="1.2" />
        <Label x={next.x} y={next.y - 12} spec={NEXT_LABEL}>
          ?
        </Label>
      </g>
    </svg>
  )
}

/* Four growth stages of the ONE tree (+ the depth-8 label variant).
   Mock first names only — no real data. */
const PANELS = [
  {
    key: 'depth-1',
    caption:
      'Depth 1 — the young tree: filmmaker → you, the canopy already alive above and below the origin.',
    chain: [{ x: 75, y: 150, name: 'Avery' }],
    you: { x: 185, y: 112 },
    next: { x: 262, y: 88 },
  },
  {
    key: 'depth-2',
    caption: 'Depth 2 — one generation further: the same form, one more hand on the arm.',
    chain: [
      { x: 70, y: 162, name: 'Avery' },
      { x: 160, y: 122, name: 'Mara' },
    ],
    you: { x: 255, y: 95 },
    next: { x: 330, y: 75 },
  },
  {
    key: 'depth-3',
    caption: 'Depth 3 — the mature form: three generations articulated, buds at every hand.',
    chain: [
      { x: 62, y: 172, name: 'Avery' },
      { x: 148, y: 133, name: 'Priya' },
      { x: 238, y: 104, name: 'Jonas' },
    ],
    you: { x: 322, y: 82 },
    next: { x: 392, y: 64 },
  },
  {
    key: 'depth-8a',
    caption:
      'Depth ~8, variant A — the mature form with compressed ancestry: deeper history enters from the left as a receding line alone.',
    chain: [
      { x: 48, y: 180, name: 'Avery' },
      { x: 185, y: 128, name: 'Dev' },
      { x: 268, y: 100, name: 'Lena' },
    ],
    you: { x: 340, y: 78 },
    next: { x: 398, y: 62 },
    receding: true,
  },
  {
    key: 'depth-8b',
    caption:
      'Depth ~8, variant B — the receding line carries the existing collapse grammar: "⋯ 5 hands ⋯" (numerals always).',
    chain: [
      { x: 48, y: 180, name: 'Avery' },
      { x: 185, y: 128, name: 'Dev' },
      { x: 268, y: 100, name: 'Lena' },
    ],
    you: { x: 340, y: 78 },
    next: { x: 398, y: 62 },
    receding: true,
    hiddenHands: 5,
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
          Lineage emblem v2 — the tree grammar
        </h1>
        <p className="mb-8 max-w-2xl font-sans text-sm text-warm/60">
          One tree, four growth stages, growing left to right. Solid gold = your realized path;
          dotted gold = the unminted next ticket; dotted gray = the network&rsquo;s other branches,
          always unlabeled. Mock names, zero real data; the live pass-it-on modal is untouched.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {PANELS.map((p) => (
            <figure key={p.key} data-panel={p.key} className="border border-mist/[0.12] bg-ink-2 p-3">
              <TreePanel
                chain={p.chain}
                you={p.you}
                next={p.next}
                receding={p.receding}
                hiddenHands={p.hiddenHands}
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
