import { useState } from 'react'
import { DEV_HARNESS_ENABLED } from '../../lib/devHarness'

/**
 * THROWAWAY DEV HARNESS v6 — lineage-emblem TREE-GRAMMAR candidates.
 * NOT a product surface; never part of a production bundle (lazy-loaded
 * behind DEV_HARNESS_ENABLED, same mechanism as DevHarness.jsx).
 *
 * v8 (2026-07-25, founder approval of the v6 compositions + two
 * surgical changes, NO design changes): the deep panel is DELETED —
 * the depth-3 composition (v6's, exactly as rendered) is THE drawing
 * for every depth from 3 onward; for deeper chains the ONLY variable
 * is the condensed node's label suffix (1 hidden → bare name; 2+ →
 * "{name} + {n}", numerals always), demonstrated here by a label
 * toggle on the unchanged depth-3 drawing. And the condensed label's
 * SIZE now matches the named labels exactly (9px/2.0 — it had rendered
 * at 8.5px/1.5); its v6 pocket position is unchanged.
 *
 * v6 (2026-07-25): the cluster is ONE DOT — the three-dot knot is
 * dead. The compressed middle renders as a single gold node on the
 * uniform path, same treatment family as the articulated nodes and
 * subtly smaller than the direct sharer's node (NEVER larger); the
 * label does the counting work. The count suffix tightens to "+ {n}"
 * ("PRIYA + 4"), numerals always; one hidden hand stays the bare name.
 *
 * v5 (2026-07-25, founder structural ruling — THE NAMED-CLUSTER
 * COLLAPSE, same grammar family as src/lib/lineageThread.js):
 *  - The emblem renders AT MOST THREE articulated stops on the gold
 *    path — the filmmaker (origin), the viewer's DIRECT SHARER, and
 *    YOU (plus the dotted-gold "?"). Origin and direct sharer NEVER
 *    compress — permanent anchors.
 *  - Everything between the filmmaker and the direct sharer compresses
 *    into ONE condensed node ON the gold path (line through it
 *    unbroken and uniform), labeled with the NEAREST HIDDEN HAND'S
 *    REAL first name plus a count: 0 hidden hands → NO cluster node;
 *    1 hidden → the name alone ("PRIYA"); 2+ hidden → "{name} + {n}"
 *    ("PRIYA + 4"), numerals always (the v5 "+ n more" suffix is
 *    dead). The named person is the hand who shared TO the direct
 *    sharer — real lineage data, never invented (mock names here).
 *    The v4 "N hands"/numeral-only treatments are DEAD.
 *  - Four panels: depths 1 and 2 approved as rendered in v4; depth 3
 *    collapsed under the rule (cluster "PRIYA") and THINNED (~⅓ of the
 *    second-generation buds removed — the founder found v4's depth 3
 *    slightly too complicated); depth 8 in the same silhouette with
 *    the condensed node "PRIYA + 4".
 * Carried v4 rules: GOLD PATH UNIFORMITY — identical width, color,
 * opacity, and style on every gold segment, no fading anywhere.
 * Panels are composed and judged ALONE (v3 rule). Composition rules of
 * thumb: gold path never buried, the "?" region kept clear, thin
 * second-generation buds first if crowding.
 *
 * Still a BRANCHING TREE with a direction of growth: one origin (the
 * filmmaker) at the left, the network growing rightward, arms forking
 * organically with buds top and bottom. Left-to-right reads as time.
 *
 * LINE GRAMMAR (founder-stamped 2026-07-25, unchanged):
 *  - filmmaker → … → YOU (realized path): SOLID GOLD, uniform;
 *  - YOU → "?" (the unminted next ticket): DOTTED GOLD;
 *  - all off-path branches and nodes: DOTTED GRAY, faded, UNLABELED —
 *    never invented people (real forks come from lineageForks server
 *    booleans in the eventual implementation).
 *  Color carries whose story it is (gold = yours); texture carries what
 *  is real yet (solid = happened, dotted = not yet). The "?" is the only
 *  node on a gold dotted line: hollow, slightly larger, gold-ringed.
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
      {/* Role label with parentheses (v5 check, per the founder's
          parentheses rule — the legacy graph already ships
          "(filmmaker)"; the live constellation's bare FILMMAKER is a
          flagged gap, out of scope here). */}
      <text
        x={x}
        y={y + 57}
        textAnchor="middle"
        fill="#9A9890"
        fontSize="7.5"
        letterSpacing="3"
        style={{ fontFamily: LABEL_FONT }}
      >
        (FILMMAKER)
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
 * One growth stage of the tree. `chain` = the articulated gold nodes
 * (filmmaker first, then the direct sharer; YOU excluded); `condensed`
 * = the single collapse node + its name label (v6).
 */
function TreePanel({ chain, you, next, gray, condensed = null }) {
  const filmmaker = chain[0]
  const named = chain.slice(1)
  const goldPoints = [...chain, you]
  return (
    <svg viewBox="0 0 420 240" className="block w-full" aria-hidden>
      {/* Off-path growth first, under the gold — bespoke per panel (v3),
          with branches begetting branches. */}
      <GrayGrowth gray={gray} />

      {/* The realized path: SOLID GOLD, UNIFORM along its whole length
          (v4 global rule — identical width/color/opacity per segment;
          the old receding treatment is abolished). */}
      {goldPoints.slice(0, -1).map((p, i) => {
        const q = goldPoints[i + 1]
        return (
          <line key={`g${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={GOLD} strokeWidth="1.4" />
        )
      })}

      {/* The named-cluster collapse (v6): ONE single gold node ON the
          gold path — the uniform line running through unbroken; subtly
          smaller than the articulated nodes (r 3.2 vs 3.5), never
          larger. The label does the counting: the nearest hidden hand's
          name (+ " + n" when 2+ hidden), horizontal beneath, in the
          constellation's fine-label treatment. */}
      {condensed && (
        <g>
          <circle cx={condensed.dot[0]} cy={condensed.dot[1]} r="3.2" fill="#C7A96B" />
          <text
            x={condensed.label.x}
            y={condensed.label.y}
            textAnchor="middle"
            fill="rgba(199,169,107,0.9)"
            fontSize="9"
            letterSpacing="2"
            style={{ fontFamily: LABEL_FONT, textTransform: 'uppercase' }}
          >
            {condensed.label.text}
          </text>
        </g>
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

/* v5: each panel's off-path composition is inline in PANELS below; the
   deep panel no longer shares data with a sub-variant twin. */

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
      'Depth 2 — the second-generation fork sits on the OPPOSITE side from depth 1 (bottom); one more bud now descends from the origin (v4).',
    chain: [
      { x: 70, y: 162, name: 'Avery' },
      { x: 160, y: 122, name: 'Mara' },
    ],
    you: { x: 255, y: 95 },
    next: { x: 330, y: 75 },
    gray: {
      lines: [
        // The origin's up-limb — and a bud descending from the origin (v4).
        [70, 162, 103, 110],
        [103, 110, 140, 86],
        [70, 162, 100, 205],
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
        [100, 205],
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
      'Depth 3+ — THE drawing for every depth from 3 onward (v8): filmmaker → the condensed node → Jonas (direct sharer) → you. Only the label changes with depth: "PRIYA" (one hidden hand) or "PRIYA + {n}" (numerals always). Toggle above to preview both.',
    labelStates: { one: 'Priya', many: 'Priya + 4' },
    chain: [
      { x: 62, y: 172, name: 'Avery' },
      { x: 238, y: 104, name: 'Jonas' },
    ],
    you: { x: 322, y: 82 },
    next: { x: 392, y: 64 },
    condensed: {
      dot: [150, 138],
      label: { text: 'Priya', x: 150, y: 164 },
    },
    gray: {
      lines: [
        // The origin's top: the long meandering limb, now two links.
        [62, 172, 88, 128],
        [88, 128, 114, 92],
        // The origin's underside: chain + fork (third link removed).
        [62, 172, 95, 215],
        [95, 215, 140, 224],
        [95, 215, 126, 196],
        // The cluster's top: one limb, one onward bud (second fork gone).
        [150, 138, 184, 96],
        [184, 96, 222, 76],
        // The cluster's underside: the limb forks two ways.
        [150, 138, 176, 184],
        [176, 184, 212, 200],
        [176, 184, 208, 166],
        // Jonas: one young top bud; the down-limb (fork removed).
        [238, 104, 272, 62],
        [238, 104, 268, 150],
        [268, 150, 305, 168],
      ],
      dots: [
        [88, 128],
        [114, 92],
        [95, 215],
        [140, 224],
        [126, 196],
        [184, 96],
        [222, 76],
        [176, 184],
        [212, 200],
        [208, 166],
        [272, 62],
        [268, 150],
        [305, 168],
      ],
    },
  },
]

export default function DevEmblemHarness() {
  /* The depth-3+ label preview (v8): switches ONLY the condensed node's
     label text on the unchanged drawing — nothing in the composition
     moves. */
  const [depthState, setDepthState] = useState('one')

  // Defense in depth: the route is already gated, but never render otherwise.
  if (!DEV_HARNESS_ENABLED) return null

  const toggleBtn = (state, label) => (
    <button
      type="button"
      onClick={() => setDepthState(state)}
      className={`border px-2 py-0.5 font-sans text-[10px] uppercase tracking-[0.14em] transition-colors ${
        depthState === state
          ? 'border-gold text-gold-soft'
          : 'border-mist/[0.2] text-warm/50 hover:text-warm'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-dvh bg-bg-page p-6 text-warm">
      <div className="mx-auto max-w-5xl">
        <p className="mb-1 font-sans text-xs uppercase tracking-widest text-error">
          THROWAWAY DEV HARNESS — not in production
        </p>
        <h1 className="mb-2 font-serif-v3 text-2xl italic">
          Lineage emblem v8 — three panels, one drawing from depth 3 on
        </h1>
        <p className="mb-8 max-w-2xl font-sans text-sm text-warm/60">
          At most three articulated stops — filmmaker, your direct sharer, you. Hidden hands
          between them condense into one gold node on the line, named for the hand nearest
          your sharer ("Priya", or "Priya + 4"). The depth-3 drawing serves every deeper
          chain; only the label suffix changes. Gold uniform end to end; dotted gold = the
          unminted next ticket; dotted gray = the network&rsquo;s other branches, always
          unlabeled. Mock names, zero real data; the live pass-it-on modal is untouched.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {PANELS.map((p) => {
            const condensed = p.labelStates
              ? {
                  ...p.condensed,
                  label: { ...p.condensed.label, text: p.labelStates[depthState] },
                }
              : p.condensed
            return (
              <figure key={p.key} data-panel={p.key} className="border border-mist/[0.12] bg-ink-2 p-3">
                {p.labelStates && (
                  <div className="mb-2 flex items-center gap-2 px-1" data-toggle>
                    <span className="font-sans text-[10px] uppercase tracking-[0.14em] text-warm/40">
                      Hidden hands:
                    </span>
                    {toggleBtn('one', '1 — "Priya"')}
                    {toggleBtn('many', '5 — "Priya + 4"')}
                  </div>
                )}
                <TreePanel
                  chain={p.chain}
                  you={p.you}
                  next={p.next}
                  gray={p.gray}
                  condensed={condensed}
                />
                <figcaption className="mt-2 px-1 font-sans text-xs leading-relaxed text-warm/55">
                  {p.caption}
                </figcaption>
              </figure>
            )
          })}
        </div>
      </div>
    </div>
  )
}
