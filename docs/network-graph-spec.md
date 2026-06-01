# Deepcast Network Graph — Layout Algorithm Specification

## Overview

A radial network graph showing how a film spreads through a social network. A film camera icon sits at the center, surrounded by concentric rings of human icons. Each ring represents a "generation" of sharing — the film crew shares with their contacts (ring 1), those contacts share onward (ring 2), and so on for 5+ tiers.

## Visual Requirements

- **Perfect circular rings** — every node on a given tier sits at exactly the same radius
- **Zero overlapping icons** — minimum 32px spacing between any two nodes on the same ring
- **Zero crossing lines** — links between parent and child nodes never intersect
- **Consistent ring spacing** — 65px minimum gap between consecutive rings
- **Radial links** — every line points roughly outward from center (short, not diagonal)

## Core Math

### Constants

```
cx, cy        = center of the graph (e.g. 425, 270)
MIN_SPACING   = 32        // minimum pixels between adjacent nodes on a ring
R1_BASE       = 200       // minimum radius for ring 1
R1_R2_GAP     = 65        // minimum gap between consecutive rings
```

### Ring Radius Formula

For any ring with `N` nodes:

```
R = max(R_previous + R1_R2_GAP, ceil(N * MIN_SPACING / (2 * PI)))
```

This guarantees two things:
1. The ring is far enough from the previous ring (at least 65px gap)
2. The circumference is large enough to fit all nodes with 32px spacing

### Ring 1 — Direct Recipients

All recipients from all teams, placed in **team-section order** starting at angle `-PI/2` (12 o'clock).

Each team gets a proportional angular section: `sectionAngle = (teamSize / totalRecipients) * 2PI`

Within each section, nodes are evenly spaced:
```
angle = sectionStart + ((j + 0.5) / teamSize) * sectionAngle
```

### Ring 2 — Second-Degree Shares

All tier-2 nodes evenly spaced on a single circle, placed in the **same team iteration order** as ring 1:

```
slotAngle = 2PI / totalTier2Nodes
angle = -PI/2 + globalIndex * slotAngle
```

This preserves angular correspondence with ring 1 — each parent's children are near the parent's angular position, so links stay short and radial.

### Rings 3–5+ — Generative Tiers (The Key Algorithm)

This is where the complexity lives. Each ring is generated from the previous ring's nodes.

#### Step 1: Select Sharers

From the previous ring, deterministically select which nodes "share onward":

```js
for (let i = 0; i < prevRingNodes.length; i++) {
    if ((i * 7 + tier * 13) % 100 < shareRate * 100) {
        const roll = (i * 7 + tier * 11) % 100;
        const count = roll < 60 ? 1 : roll < 85 ? 2 : roll < 95 ? 3 : roll < 99 ? 4 : 5;
        sharers.push({ parent: prevRingNodes[i], count });
    }
}
```

Share rates by tier:
- Tier 3: 30% share rate (slight diminishment)
- Tier 4: 48% share rate (full strength)
- Tier 5: 48% share rate (full strength)
- Additional tiers: configure as needed

Share count distribution (weighted): 60% share to 1, 25% to 2, 10% to 3, 4% to 4, 1% to 5.

#### Step 2: Sort Sharers by Parent Angle

```js
sharers.sort((a, b) => normalize(a.parent.angle) - normalize(b.parent.angle));
```

Where `normalize(a) = ((a % 2PI) + 2PI) % 2PI` maps any angle to `[0, 2PI)`.

#### Step 3: Find the Largest Angular Gap (Seam Placement)

This is critical. The "seam" is where the circular sequence wraps from 2PI back to 0. If the seam falls in the middle of a cluster of parents, the collision resolution will push children across the boundary, placing them on the opposite side of the circle from their parents.

```js
let maxGap = 0, seamIdx = 0;
for (let i = 0; i < sharers.length; i++) {
    const cur = normalize(sharers[i].parent.angle);
    const nxt = (i < sharers.length - 1)
        ? normalize(sharers[i + 1].parent.angle)
        : normalize(sharers[0].parent.angle) + 2PI;
    const gap = nxt - cur;
    if (gap > maxGap) { maxGap = gap; seamIdx = i; }
}
```

Then reorder sharers to start right after the gap:

```js
const ordered = [];
for (let i = 0; i < sharers.length; i++) {
    ordered.push(sharers[(seamIdx + 1 + i) % sharers.length]);
}
```

#### Step 4: Assign Monotonic Angles

Convert all parent angles to a monotonically increasing sequence (no wraparound):

```js
const baseAngle = normalize(ordered[0].parent.angle);
for (const s of ordered) {
    let a = normalize(s.parent.angle);
    if (a < baseAngle - 0.001) a += 2PI;
    s.monoAngle = a;
}
```

#### Step 5: Place Children in Contiguous Blocks

Each parent's children are placed as a **contiguous group** centered at the parent's angle. Children of different parents are **never interleaved** — this is what prevents line crossings.

```js
const minGap = MIN_SPACING / tierRadius;

for (const sharer of ordered) {
    for (let k = 0; k < sharer.count; k++) {
        const offset = (k - (sharer.count - 1) / 2) * minGap;
        child.angle = sharer.monoAngle + offset;
    }
}
```

#### Step 6: Forward Collision Resolution

A single forward pass ensures minimum spacing. Because angles are monotonic (Step 4) and the seam is in the largest gap (Step 3), no child gets pushed to the wrong side of the circle.

```js
for (let i = 1; i < children.length; i++) {
    if (children[i].angle - children[i - 1].angle < minGap) {
        children[i].angle = children[i - 1].angle + minGap;
    }
}
```

#### Step 7: Convert Angle to Cartesian

```js
x = cx + tierRadius * cos(angle)
y = cy + tierRadius * sin(angle)
```

### Why This Produces Zero Crossings

Three invariants guarantee no line crossings:

1. **Contiguous blocks**: each parent's children are adjacent in the angular sequence — no interleaving with other parents' children
2. **Parent-angle ordering**: blocks are ordered by parent angle, so if parent A is clockwise-before parent B, all of A's children are clockwise-before all of B's children
3. **Seam in the gap**: the 0/2PI boundary sits in the largest angular gap between parents, so no parent's children are split across it

These three properties mean the parent-to-child mapping is **non-crossing** — it's impossible for two links to intersect.

### Why This Scales to More Tiers

The radius formula `R = max(R_prev + 65, ceil(N * 32 / 2PI))` automatically adapts:
- Few nodes on a ring → radius grows by the minimum 65px gap
- Many nodes → radius grows to fit them all with 32px spacing
- The algorithm is the same for every tier — just feed the previous ring's nodes as input

## Output Format

The algorithm produces two arrays:

```js
nodes: [
    { id: string, label: string, x: number, y: number, tier: number, type: 'film'|'human', teamId: string }
]

links: [
    { source: string, target: string }  // node IDs
]
```

## Complete Reference Implementation

```js
const generateGraphData = (userShares = 0) => {
    const cx = 425;
    const cy = 270;
    const MIN_SPACING = 32;
    const R1_BASE = 200;
    const R1_R2_GAP = 65;

    // --- INPUT DATA ---
    // TEAM_DATA: array of { id, label, recipients: string[] }
    // TIER2_SHARERS: { [recipientName]: numberOfShares } — who shares onward from ring 1
    // TIER2_NAMES: string[] — name pool for generated nodes

    // Flatten all recipients
    const allRecipients = [];
    for (const team of TEAM_DATA) {
        for (const name of team.recipients) {
            allRecipients.push({ name, teamId: team.id, teamLabel: team.label });
        }
    }
    const totalCount = allRecipients.length;

    // --- RING 1: Direct recipients ---
    const R1 = Math.max(R1_BASE, Math.ceil((totalCount * MIN_SPACING) / (2 * Math.PI)));
    const slotAngle = (2 * Math.PI) / totalCount;

    // --- RING 2: Second-degree shares ---
    let totalT2 = 0;
    for (const r of allRecipients) {
        totalT2 += (TIER2_SHARERS[r.name] || 0);
    }
    const R2 = Math.max(R1 + R1_R2_GAP, Math.ceil((totalT2 * MIN_SPACING) / (2 * Math.PI)));
    const t2SlotAngle = (2 * Math.PI) / totalT2;

    const nodes = [{ id: 'film', label: '', x: cx, y: cy, size: 1.0, type: 'film', tier: 0 }];
    const links = [];
    const sectionLabels = [];
    const tier2Nodes = [];

    let youAngle = null;
    let t2NameIdx = 0;
    let globalIdx = 0;
    let globalT2Idx = 0;

    let sectionStart = -Math.PI / 2;
    const t2StartAngle = -Math.PI / 2;

    // Place ring 1 and ring 2 nodes in team-section order
    for (const team of TEAM_DATA) {
        const N = team.recipients.length;
        const sectionAngle = (N / totalCount) * 2 * Math.PI;
        const sectionEnd = sectionStart + sectionAngle;
        const sectionMid = sectionStart + sectionAngle / 2;

        sectionLabels.push({
            label: team.label,
            angle: sectionMid,
            r: R1 - 40,
            cx, cy,
            teamId: team.id
        });

        for (let j = 0; j < N; j++) {
            const recipName = team.recipients[j];
            const isYou = (recipName === 'You');
            const nodeId = isYou ? 'you' : `r_${globalIdx}`;
            const angle = N === 1 ? sectionMid : sectionStart + ((j + 0.5) / N) * sectionAngle;

            if (isYou) youAngle = angle;

            nodes.push({
                id: nodeId, label: recipName,
                x: cx + R1 * Math.cos(angle),
                y: cy + R1 * Math.sin(angle),
                size: 1.0, type: 'human', tier: 1,
                teamId: team.id, teamLabel: team.label
            });
            links.push({ source: 'film', target: nodeId });

            // Ring 2 children
            const t2Count = isYou ? 0 : (TIER2_SHARERS[recipName] || 0);
            if (t2Count > 0) {
                for (let k = 0; k < t2Count; k++) {
                    const t2Angle = t2StartAngle + globalT2Idx * t2SlotAngle;
                    const t2Id = `${nodeId}_s${k}`;
                    const t2Label = TIER2_NAMES[t2NameIdx % TIER2_NAMES.length];
                    t2NameIdx++;
                    globalT2Idx++;

                    nodes.push({
                        id: t2Id, label: t2Label,
                        x: cx + R2 * Math.cos(t2Angle),
                        y: cy + R2 * Math.sin(t2Angle),
                        size: 1.0, type: 'human', tier: 2,
                        teamId: team.id
                    });
                    links.push({ source: nodeId, target: t2Id });
                    tier2Nodes.push({ id: t2Id, teamId: team.id, angle: t2Angle });
                }
            }

            globalIdx++;
        }

        sectionStart = sectionEnd;
    }

    // "You" user shares
    if (youAngle !== null && userShares > 0) {
        for (let k = 0; k < userShares; k++) {
            const t2Angle = t2StartAngle + globalT2Idx * t2SlotAngle;
            globalT2Idx++;
            const shareId = `share_${k}`;
            nodes.push({
                id: shareId, label: '',
                x: cx + R2 * Math.cos(t2Angle),
                y: cy + R2 * Math.sin(t2Angle),
                size: 1.0, type: 'human', tier: 2, teamId: 'kim'
            });
            links.push({ source: 'you', target: shareId });
        }
    }

    // --- RINGS 3–5+: Generative tiers ---
    const TIER_CONFIG = [
        null, null, null,
        { shareRate: 0.30 },  // tier 3: slight diminishment
        { shareRate: 0.48 },  // tier 4: full strength
        { shareRate: 0.48 },  // tier 5: full strength
        // Add more tiers here as needed
    ];

    let prevRingNodes = tier2Nodes;
    let prevR = R2;
    let nameIdx = t2NameIdx;

    for (let tier = 3; tier < TIER_CONFIG.length; tier++) {
        const cfg = TIER_CONFIG[tier];
        if (!cfg || prevRingNodes.length === 0) break;

        // Step 1: Select sharers deterministically
        const sharers = [];
        for (let i = 0; i < prevRingNodes.length; i++) {
            if ((i * 7 + tier * 13) % 100 < cfg.shareRate * 100) {
                const roll = (i * 7 + tier * 11) % 100;
                const count = roll < 60 ? 1 : roll < 85 ? 2 : roll < 95 ? 3 : roll < 99 ? 4 : 5;
                sharers.push({ parent: prevRingNodes[i], count });
            }
        }

        const totalThisTier = sharers.reduce((s, x) => s + x.count, 0);
        if (totalThisTier === 0) break;

        // Ring radius
        const tierR = Math.max(prevR + R1_R2_GAP,
            Math.ceil((totalThisTier * MIN_SPACING) / (2 * Math.PI)));
        const minGap = MIN_SPACING / tierR;

        // Step 2: Sort sharers by parent angle
        const TWO_PI = 2 * Math.PI;
        const norm = a => ((a % TWO_PI) + TWO_PI) % TWO_PI;
        sharers.sort((a, b) => norm(a.parent.angle) - norm(b.parent.angle));

        // Step 3: Find largest gap — place seam there
        let maxGap = 0, seamIdx = 0;
        for (let i = 0; i < sharers.length; i++) {
            const cur = norm(sharers[i].parent.angle);
            const nxt = i < sharers.length - 1
                ? norm(sharers[i + 1].parent.angle)
                : norm(sharers[0].parent.angle) + TWO_PI;
            const gap = nxt - cur;
            if (gap > maxGap) { maxGap = gap; seamIdx = i; }
        }

        // Reorder to start after the gap
        const ordered = [];
        for (let i = 0; i < sharers.length; i++) {
            ordered.push(sharers[(seamIdx + 1 + i) % sharers.length]);
        }

        // Step 4: Monotonic angles (no wraparound)
        const baseAngle = norm(ordered[0].parent.angle);
        for (const s of ordered) {
            let a = norm(s.parent.angle);
            if (a < baseAngle - 0.001) a += TWO_PI;
            s._mono = a;
        }

        // Step 5: Place children in contiguous blocks
        const pending = [];
        for (const s of ordered) {
            for (let k = 0; k < s.count; k++) {
                const offset = (k - (s.count - 1) / 2) * minGap;
                const nodeId = `${s.parent.id}_t${tier}_${k}`;
                const label = TIER2_NAMES[nameIdx % TIER2_NAMES.length];
                nameIdx++;
                pending.push({
                    nodeId, label, parentId: s.parent.id,
                    teamId: s.parent.teamId,
                    angle: s._mono + offset
                });
            }
        }

        // Step 6: Forward collision resolution
        for (let i = 1; i < pending.length; i++) {
            if (pending[i].angle - pending[i - 1].angle < minGap) {
                pending[i].angle = pending[i - 1].angle + minGap;
            }
        }

        // Step 7: Place nodes
        const thisRingNodes = [];
        for (const p of pending) {
            const angle = p.angle;
            nodes.push({
                id: p.nodeId, label: p.label,
                x: cx + tierR * Math.cos(angle),
                y: cy + tierR * Math.sin(angle),
                size: 1.0, type: 'human',
                tier, teamId: p.teamId
            });
            links.push({ source: p.parentId, target: p.nodeId });
            thisRingNodes.push({ id: p.nodeId, teamId: p.teamId, angle });
        }

        prevRingNodes = thisRingNodes;
        prevR = tierR;
    }

    return { nodesData: nodes, linksData: links, sectionLabels };
};
```

## Adding More Tiers

To add tier 6, 7, etc., just extend `TIER_CONFIG`:

```js
const TIER_CONFIG = [
    null, null, null,
    { shareRate: 0.30 },  // tier 3
    { shareRate: 0.48 },  // tier 4
    { shareRate: 0.48 },  // tier 5
    { shareRate: 0.48 },  // tier 6 — add as many as you want
    { shareRate: 0.48 },  // tier 7
];
```

The algorithm handles any number of tiers. Radii grow automatically, the seam-placement and collision resolution work identically for every tier.

## Data Model

### Input

```
TEAM_DATA: [
    { id: "kim", label: "Kim", recipients: ["Alex", "You", "Sam", ...] }
]

TIER2_SHARERS: {
    "Alex": 1,    // shares to 1 person
    "Val": 3,     // shares to 3 people
    "Cora": 5,    // shares to 5 people
}

TIER2_NAMES: ["Ora", "Pip", "Rue", ...]  // name pool for generated nodes
```

### Output

```
{
    nodesData: [
        { id, label, x, y, tier, type, teamId, size }
    ],
    linksData: [
        { source: nodeId, target: nodeId }
    ],
    sectionLabels: [
        { label, angle, r, cx, cy, teamId }
    ]
}
```

The backend only needs to compute the node positions and links. The frontend renders them as SVG circles/icons with lines between linked nodes.
