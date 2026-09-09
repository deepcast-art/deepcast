import {
  railPathNodes,
  railPathPositions,
  RAIL_PATH_STROKE_OPACITY,
  railPathDescription,
  RAIL_PATH_VIEWBOX,
  RAIL_PATH_NODE_Y,
  RAIL_PATH_LABEL_Y,
  RAIL_PATH_CAPTION_Y,
} from '../lib/railPath'

/**
 * The rail's path (founder design from the 9 September 2026 canvas; label
 * pass the same day: one grey for every label but YOU and the next slot —
 * docs/watch-page-spec.md §3b item 6): one inline SVG, full rail width,
 * 1.25rem under "Pass it on", replacing the rule line. The film's hands as
 * a row of nodes — origin first with "(FILMMAKER)" beneath, through the
 * hands (a single collapsed entry when there are more than three), then
 * "YOU", then the hollow next slot "?". No hover, no motion, not a link.
 *
 * Colour law: one grey for every label but YOU and the next slot — names,
 * the collapsed "{n} OTHERS" entry, and the "(FILMMAKER)" caption all read
 * warm at 0.70, never gold, never the muted beige; YOU is full warm, "?"
 * is accent. Gold appears only as the path, the nodes, and the "?" —
 * marks, not copy. The rule (which
 * nodes, which labels, the collapse) lives in src/lib/railPath.js; this
 * file only draws it. The SVG carries the accessible sentence the rule
 * line used to (role="img" + aria-label).
 */
const ACCENT = '#b1a180'
const WARM = '#dddddd'
const FONT = { fontFamily: 'var(--font-sans)', fontWeight: 400 }

function labelStyle(node) {
  switch (node.type) {
    case 'you':
      return { size: 10, fill: WARM, opacity: 1 }
    case 'next':
      return { size: 11, fill: ACCENT, opacity: 1 }
    default:
      return { size: 10, fill: WARM, opacity: 0.7 }
  }
}

export default function RailPath({ hands }) {
  const nodes = railPathNodes(hands)
  if (!nodes.length) return null
  const xs = railPathPositions(nodes.length)
  const youIndex = nodes.findIndex((n) => n.type === 'you')
  const Y = RAIL_PATH_NODE_Y

  return (
    <svg
      data-rail-path
      role="img"
      aria-label={railPathDescription(nodes)}
      viewBox={`0 0 ${RAIL_PATH_VIEWBOX.width} ${RAIL_PATH_VIEWBOX.height}`}
      width="100%"
      preserveAspectRatio="xMinYMid meet"
      overflow="visible"
      className="block h-auto w-full"
    >
      {/* One stroke for the whole path (founder line rule 2026-09-09): every
          segment 1px accent at 0.55, no brightening ramp; the final run from
          "you" to the next slot — not yet walked — differs only in its dash. */}
      {nodes.slice(0, -1).map((node, i) => (
        <line
          key={`seg-${i}`}
          x1={xs[i]}
          y1={Y}
          x2={xs[i + 1]}
          y2={Y}
          stroke={ACCENT}
          strokeWidth="1"
          strokeOpacity={RAIL_PATH_STROKE_OPACITY}
          strokeDasharray={i >= youIndex ? '2 4' : undefined}
        />
      ))}
      {/* Nodes: hands and the collapsed entry r2.6 at 0.85; YOU r3.2 solid;
          the next slot r3.2 hollow, 1px accent stroke. */}
      {nodes.map((node, i) =>
        node.type === 'next' ? (
          <circle key={`node-${i}`} cx={xs[i]} cy={Y} r="3.2" fill="none" stroke={ACCENT} strokeWidth="1" data-node="next" />
        ) : node.type === 'you' ? (
          <circle key={`node-${i}`} cx={xs[i]} cy={Y} r="3.2" fill={ACCENT} data-node="you" />
        ) : (
          <circle key={`node-${i}`} cx={xs[i]} cy={Y} r="2.6" fill={ACCENT} fillOpacity="0.85" data-node={node.type} />
        )
      )}
      {/* Labels, centred under their node. */}
      {nodes.map((node, i) => {
        const s = labelStyle(node)
        return (
          <text
            key={`label-${i}`}
            x={xs[i]}
            y={RAIL_PATH_LABEL_Y}
            textAnchor="middle"
            fontSize={s.size}
            fill={s.fill}
            fillOpacity={s.opacity}
            style={{ ...FONT, letterSpacing: '1.8px' }}
            data-label={node.type}
          >
            {node.label}
          </text>
        )
      })}
      {/* "(FILMMAKER)" under the first node only — the same grey as the names. */}
      {nodes[0].caption && (
        <text
          x={xs[0]}
          y={RAIL_PATH_CAPTION_Y}
          textAnchor="middle"
          fontSize="8"
          fill={WARM}
          fillOpacity="0.7"
          style={{ ...FONT, letterSpacing: '1.6px' }}
          data-label="caption"
        >
          {nodes[0].caption}
        </text>
      )}
    </svg>
  )
}
