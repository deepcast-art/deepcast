import { DEV_HARNESS_ENABLED } from '../../lib/devHarness'

/**
 * THROWAWAY DEV HARNESS v3 — lineage-emblem TREE-GRAMMAR candidates.
 * NOT a product surface; never part of a production bundle (lazy-loaded
 * behind DEV_HARNESS_ENABLED, same mechanism as DevHarness.jsx).
 *
 * v3 (2026-07-25, the founder's render review of v2, his sketch as the
 * reference): the missing texture was branches BEGETTING branches — so
 * every panel now carries second-generation off-path forks (gray buds
 * off gray buds, top and bottom, flowing rightward). The v2 requirement
 * that all panels read as one organism at successive ages is RELAXED by
 * founder decision: each panel is composed alone and judged alone.
 * Composition rule of thumb kept from his notes: the gold path stays
 * unmistakable, the "?" stays clearly at the growing tip, and if a panel
 * crowds, second-generation buds thin first — primary structure wins.
 *
 * Still a BRANCHING TREE with a direction of growth: one origin (the
 * filmmaker) at the left, the network growing rightward, arms forking
 * organically with buds top and bottom. Left-to-right reads as time.
 *
 * LINE GRAMMAR (founder-stamped 2026-07-25, unchanged from v2):
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

/*
 * v3 off-path composition: bespoke per panel (the one-organism rule is
 * relaxed). Each panel supplies `gray` — dotted-gray segments and the
 * unlabeled dots at their tips and junctions. Segments chain freely, so
 * branches beget branches (buds off buds, two levels deep where the
 * composition can hold it).
 */

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

/** Bespoke off-path growth: dotted-gray limbs and their unlabeled dots. */
function GrayGrowth({ gray }) {
  return (
    <g>
      {gray.lines.map(([x1, y1, x2, y2], i) => (
        <line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} {...GRAY_EDGE} />
      ))}
      {gray.dots.map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} {...GRAY_DOT} />
      ))}
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
function TreePanel({ chain, you, next, gray, receding = false, hiddenHands = null }) {
  const filmmaker = chain[0]
  const named = chain.slice(1)
  const goldPoints = [...chain, you]
  const mid = {
    x: (chain[0].x + chain[1]?.x) / 2 || 0,
    y: (chain[0].y + chain[1]?.y) / 2 || 0,
  }
  return (
    <svg viewBox="0 0 420 240" className="block w-full" aria-hidden>
      {/* Off-path growth first, under the gold — bespoke per panel (v3),
          with branches begetting branches. */}
      <GrayGrowth gray={gray} />

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

/* Five panels, each composed alone (v3). Mock first names only — no real
   data. Gray structures branch two levels deep: buds off buds. */

/* Depth-8 off-path composition, shared by both ancestry variants: canopy
   and under-limb at the origin, two down-twigs off the receding line
   (kept BELOW it so variant B's label sits clear above), and forking
   limbs at both visible hands. */
const DEEP_GRAY = {
  lines: [
    // The origin's canopy: a limb that forks, and a fork off the fork.
    [48, 180, 75, 124],
    [75, 124, 105, 98],
    [75, 124, 110, 136],
    [105, 98, 140, 78],
    // The origin's under-limb with second growth.
    [48, 180, 85, 222],
    [85, 222, 130, 230],
    // Twigs off the compressed ancestry line (hidden generations' spread).
    [100, 160, 122, 198],
    [150, 141, 168, 178],
    // DEV: an up-limb with a second-generation bud; a down-limb forking.
    [185, 128, 212, 84],
    [212, 84, 250, 62],
    [185, 128, 215, 175],
    [215, 175, 255, 195],
    [215, 175, 252, 160],
    // LENA: a down-limb whose bud buds again.
    [268, 100, 300, 140],
    [300, 140, 338, 158],
  ],
  dots: [
    [75, 124],
    [105, 98],
    [110, 136],
    [140, 78],
    [85, 222],
    [130, 230],
    [122, 198],
    [168, 178],
    [212, 84],
    [250, 62],
    [215, 175],
    [255, 195],
    [252, 160],
    [300, 140],
    [338, 158],
  ],
}

const PANELS = [
  {
    key: 'depth-1',
    caption:
      'Depth 1 — the young tree: filmmaker → you. The canopy bud now forks again (a bud off a bud, top side).',
    chain: [{ x: 75, y: 150, name: 'Avery' }],
    you: { x: 185, y: 112 },
    next: { x: 262, y: 88 },
    gray: {
      lines: [
        // Canopy: the filmmaker's other invitee, who shared onward twice.
        [75, 150, 108, 96],
        [108, 96, 148, 74],
        [108, 96, 150, 112],
        // The under-limb with its own growth.
        [75, 150, 120, 193],
        [120, 193, 168, 208],
      ],
      dots: [
        [108, 96],
        [148, 74],
        [150, 112],
        [120, 193],
        [168, 208],
      ],
    },
  },
  {
    key: 'depth-2',
    caption:
      'Depth 2 — the second-generation fork sits on the OPPOSITE side from depth 1 (bottom), so the silhouettes differ.',
    chain: [
      { x: 70, y: 162, name: 'Avery' },
      { x: 160, y: 122, name: 'Mara' },
    ],
    you: { x: 255, y: 95 },
    next: { x: 330, y: 75 },
    gray: {
      lines: [
        // The origin's up-limb.
        [70, 162, 103, 110],
        [103, 110, 140, 86],
        // Mara's down-limb forks twice — the mirrored second generation.
        [160, 122, 190, 170],
        [190, 170, 232, 190],
        [190, 170, 228, 152],
        // A small young bud up off Mara.
        [160, 122, 198, 80],
      ],
      dots: [
        [103, 110],
        [140, 86],
        [190, 170],
        [232, 190],
        [228, 152],
        [198, 80],
      ],
    },
  },
  {
    key: 'depth-3',
    caption:
      'Depth 3 — generous sub-branching at every hand: limbs fork, and their buds bud again, top and bottom.',
    chain: [
      { x: 62, y: 172, name: 'Avery' },
      { x: 148, y: 133, name: 'Priya' },
      { x: 238, y: 104, name: 'Jonas' },
    ],
    you: { x: 322, y: 82 },
    next: { x: 392, y: 64 },
    gray: {
      lines: [
        // The origin: an under-limb growing two levels, a canopy that forks.
        [62, 172, 95, 215],
        [95, 215, 140, 224],
        [140, 224, 180, 232],
        [62, 172, 92, 120],
        [92, 120, 128, 96],
        [92, 120, 130, 132],
        // Priya: an up-limb that forks, a down-limb with second growth.
        [148, 133, 180, 88],
        [180, 88, 220, 66],
        [180, 88, 218, 100],
        [148, 133, 172, 182],
        [172, 182, 210, 200],
        // Jonas: a down-limb with second growth; one young bud up.
        [238, 104, 268, 150],
        [268, 150, 305, 168],
        [238, 104, 272, 62],
      ],
      dots: [
        [95, 215],
        [140, 224],
        [180, 232],
        [92, 120],
        [128, 96],
        [130, 132],
        [180, 88],
        [220, 66],
        [218, 100],
        [172, 182],
        [210, 200],
        [268, 150],
        [305, 168],
        [272, 62],
      ],
    },
  },
  {
    key: 'depth-8a',
    caption:
      'Depth ~8, variant A — compressed ancestry as a receding line alone, with the hidden generations’ spread budding off it.',
    chain: [
      { x: 48, y: 180, name: 'Avery' },
      { x: 185, y: 128, name: 'Dev' },
      { x: 268, y: 100, name: 'Lena' },
    ],
    you: { x: 340, y: 78 },
    next: { x: 398, y: 62 },
    receding: true,
    gray: DEEP_GRAY,
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
    gray: DEEP_GRAY,
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
          Lineage emblem v3 — branches begetting branches
        </h1>
        <p className="mb-8 max-w-2xl font-sans text-sm text-warm/60">
          Each panel composed alone, growing left to right, with second-generation forks — buds
          off buds. Solid gold = your realized path; dotted gold = the unminted next ticket;
          dotted gray = the network&rsquo;s other branches, always unlabeled. Mock names, zero
          real data; the live pass-it-on modal is untouched.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {PANELS.map((p) => (
            <figure key={p.key} data-panel={p.key} className="border border-mist/[0.12] bg-ink-2 p-3">
              <TreePanel
                chain={p.chain}
                you={p.you}
                next={p.next}
                gray={p.gray}
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
