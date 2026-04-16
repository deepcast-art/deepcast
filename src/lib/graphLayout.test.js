import { describe, it, expect } from 'vitest'
import { normAngle, inviteRecipientKey, TWO_PI, generateGraphData, buildGraphLayout } from './graphLayout.js'

/* ================================================================
   Helpers
   ================================================================ */

/** Euclidean distance between two nodes */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Check if two line segments (p1→p2) and (p3→p4) cross */
function segmentsCross(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-10) return false // parallel
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / cross
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / cross
  // Exclude endpoints (shared parent/child) — only count interior crossings
  const eps = 1e-6
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps
}

/** Build a node lookup map from layout output */
function nodeMap(nodesData) {
  const m = new Map()
  for (const n of nodesData) m.set(n.id, n)
  return m
}

/** Count how many link pairs cross in the layout */
function countCrossings(nodesData, linksData) {
  const nm = nodeMap(nodesData)
  let crossings = 0
  for (let i = 0; i < linksData.length; i++) {
    const a1 = nm.get(linksData[i].source)
    const a2 = nm.get(linksData[i].target)
    if (!a1 || !a2) continue
    for (let j = i + 1; j < linksData.length; j++) {
      const b1 = nm.get(linksData[j].source)
      const b2 = nm.get(linksData[j].target)
      if (!b1 || !b2) continue
      // Skip links that share a node — they meet at an endpoint, not a crossing
      if (a1.id === b1.id || a1.id === b2.id || a2.id === b1.id || a2.id === b2.id) continue
      if (segmentsCross(a1, a2, b1, b2)) crossings++
    }
  }
  return crossings
}

/* ================================================================
   normAngle
   ================================================================ */

describe('normAngle', () => {
  it('maps negative angles into [0, 2π)', () => {
    expect(normAngle(-Math.PI)).toBeCloseTo(Math.PI, 10)
    expect(normAngle(-0.1)).toBeCloseTo(TWO_PI - 0.1, 10)
  })

  it('leaves in-range angles unchanged', () => {
    expect(normAngle(1)).toBe(1)
    expect(normAngle(0)).toBe(0)
  })

  it('wraps angles >= 2π back into range', () => {
    expect(normAngle(TWO_PI + 0.5)).toBeCloseTo(0.5, 10)
    expect(normAngle(3 * TWO_PI)).toBeCloseTo(0, 10)
  })
})

/* ================================================================
   inviteRecipientKey
   ================================================================ */

describe('inviteRecipientKey', () => {
  it('returns empty string for null/undefined', () => {
    expect(inviteRecipientKey(null)).toBe('')
    expect(inviteRecipientKey(undefined)).toBe('')
  })

  it('uses email-only when no name', () => {
    expect(
      inviteRecipientKey({ id: 'x', recipient_email: 'a@example.com' })
    ).toBe('a@example.com')
  })

  it('uses email:lowercaseName when name present', () => {
    expect(
      inviteRecipientKey({
        id: 'x',
        recipient_email: 'a@example.com',
        recipient_name: 'Bob Smith',
      })
    ).toBe('a@example.com:bob smith')
  })
})

/* ================================================================
   generateGraphData — static demo layout
   ================================================================ */

describe('generateGraphData', () => {
  const data = generateGraphData(0)
  const { nodesData, linksData, ringRadii, sectionLabels } = data

  it('returns all expected fields', () => {
    expect(nodesData).toBeDefined()
    expect(linksData).toBeDefined()
    expect(ringRadii).toBeDefined()
    expect(sectionLabels).toBeDefined()
    expect(data.viewBoxW).toBeGreaterThanOrEqual(850)
    expect(data.viewBoxH).toBeGreaterThanOrEqual(540)
    expect(data.rootNode).toBeDefined()
    expect(data.rootNode.type).toBe('film')
  })

  it('places the film node at center', () => {
    const film = nodesData.find((n) => n.type === 'film')
    expect(film).toBeDefined()
    expect(film.tier).toBe(0)
  })

  it('generates nodes across rings 1 through 6+', () => {
    const maxTier = Math.max(...nodesData.map((n) => n.tier))
    expect(maxTier).toBeGreaterThanOrEqual(6)
  })

  it('has a ring radius for every generated tier', () => {
    const maxTier = Math.max(...nodesData.map((n) => n.tier))
    // ringRadii[0] = 0 (center), ringRadii[1] = R1, etc.
    expect(ringRadii.length).toBeGreaterThanOrEqual(maxTier + 1)
  })

  it('ring radii increase monotonically with at least 65px gap', () => {
    for (let i = 2; i < ringRadii.length; i++) {
      expect(ringRadii[i]).toBeGreaterThanOrEqual(ringRadii[i - 1] + 65)
    }
  })

  it('all node IDs are unique', () => {
    const ids = nodesData.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every link references valid node IDs', () => {
    const ids = new Set(nodesData.map((n) => n.id))
    for (const link of linksData) {
      expect(ids.has(link.source)).toBe(true)
      expect(ids.has(link.target)).toBe(true)
    }
  })

  it('nodes on the same ring are at the correct radius from center', () => {
    const film = nodesData.find((n) => n.type === 'film')
    for (const node of nodesData) {
      if (node.tier === 0) continue
      const r = ringRadii[node.tier]
      if (!r) continue
      const d = dist(node, film)
      expect(d).toBeCloseTo(r, 0) // within 1px
    }
  })

  it('nodes on the same ring have at least 32px minimum spacing', () => {
    const byTier = new Map()
    for (const n of nodesData) {
      if (n.tier === 0) continue
      if (!byTier.has(n.tier)) byTier.set(n.tier, [])
      byTier.get(n.tier).push(n)
    }
    for (const [, nodes] of byTier) {
      if (nodes.length < 2) continue
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = dist(nodes[i], nodes[j])
          expect(d).toBeGreaterThanOrEqual(31) // 32px spec, 1px tolerance
        }
      }
    }
  })

  it('has zero crossing links', () => {
    const crossings = countCrossings(nodesData, linksData)
    expect(crossings).toBe(0)
  })

  it('viewBox fits all nodes', () => {
    for (const n of nodesData) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(data.viewBoxW)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeLessThanOrEqual(data.viewBoxH)
    }
  })

  it('produces a section label for each team', () => {
    expect(sectionLabels.length).toBe(12) // 12 teams in TEAM_DATA
    const teamIds = new Set(sectionLabels.map((s) => s.teamId))
    expect(teamIds.size).toBe(12)
  })

  it('is deterministic — same input always produces the same output', () => {
    const a = generateGraphData(0)
    const b = generateGraphData(0)
    expect(a.nodesData.length).toBe(b.nodesData.length)
    expect(a.linksData.length).toBe(b.linksData.length)
    for (let i = 0; i < a.nodesData.length; i++) {
      expect(a.nodesData[i].x).toBe(b.nodesData[i].x)
      expect(a.nodesData[i].y).toBe(b.nodesData[i].y)
    }
  })

  it('userShares adds ring-2 children to the "You" node', () => {
    const withShares = generateGraphData(3)
    const youLinks = withShares.linksData.filter((l) => l.source === 'you')
    expect(youLinks.length).toBe(3)
  })
})

/* ================================================================
   buildGraphLayout — real-data layout
   ================================================================ */

describe('buildGraphLayout', () => {
  it('returns null for empty invites', () => {
    expect(buildGraphLayout({ filmInvites: [] })).toBeNull()
    expect(buildGraphLayout({ filmInvites: null })).toBeNull()
  })

  /** Helper: build a simple 1-ring invite set */
  function makeInvites(count, senderName = 'Alice') {
    return Array.from({ length: count }, (_, i) => ({
      id: `inv-${i}`,
      film_id: 'film-1',
      sender_name: senderName,
      sender_email: 'alice@example.com',
      sender_id: 'user-1',
      recipient_name: `Person ${i}`,
      recipient_email: `person${i}@example.com`,
      status: 'sent',
      parent_invite_id: null,
      created_at: new Date(2025, 0, 1, 0, i).toISOString(),
    }))
  }

  it('builds a valid layout for a single ring of invites', () => {
    const invites = makeInvites(5)
    const layout = buildGraphLayout({ filmInvites: invites, filmTitle: 'Test Film' })

    expect(layout).not.toBeNull()
    expect(layout.nodesData.length).toBe(6) // 1 film + 5 invitees
    expect(layout.linksData.length).toBe(5)
    expect(layout.ringRadii.length).toBe(2) // [0, R1]
  })

  it('builds multiple rings from invite chains', () => {
    const invites = [
      // Ring 1: Alice invites Bob and Carol
      { id: 'i1', film_id: 'f', sender_name: 'Alice', sender_email: 'a@x.com', sender_id: 'u1', recipient_name: 'Bob', recipient_email: 'b@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:00:00Z' },
      { id: 'i2', film_id: 'f', sender_name: 'Alice', sender_email: 'a@x.com', sender_id: 'u1', recipient_name: 'Carol', recipient_email: 'c@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:01:00Z' },
      // Ring 2: Bob invites Dave, Carol invites Eve
      { id: 'i3', film_id: 'f', sender_name: 'Bob', sender_email: 'b@x.com', sender_id: 'u2', recipient_name: 'Dave', recipient_email: 'd@x.com', status: 'sent', parent_invite_id: 'i1', created_at: '2025-01-02T00:00:00Z' },
      { id: 'i4', film_id: 'f', sender_name: 'Carol', sender_email: 'c@x.com', sender_id: 'u3', recipient_name: 'Eve', recipient_email: 'e@x.com', status: 'sent', parent_invite_id: 'i2', created_at: '2025-01-02T00:01:00Z' },
      // Ring 3: Dave invites Fay
      { id: 'i5', film_id: 'f', sender_name: 'Dave', sender_email: 'd@x.com', sender_id: 'u4', recipient_name: 'Fay', recipient_email: 'f@x.com', status: 'sent', parent_invite_id: 'i3', created_at: '2025-01-03T00:00:00Z' },
    ]

    const layout = buildGraphLayout({ filmInvites: invites, filmTitle: 'Chain Test' })

    expect(layout).not.toBeNull()
    expect(layout.nodesData.length).toBe(6) // film + Bob + Carol + Dave + Eve + Fay
    expect(layout.ringRadii.length).toBe(4) // [0, R1, R2, R3]

    // Verify tiers
    const tiers = new Map()
    for (const n of layout.nodesData) {
      if (!tiers.has(n.tier)) tiers.set(n.tier, [])
      tiers.get(n.tier).push(n)
    }
    expect(tiers.get(0).length).toBe(1) // film
    expect(tiers.get(1).length).toBe(2) // Bob, Carol
    expect(tiers.get(2).length).toBe(2) // Dave, Eve
    expect(tiers.get(3).length).toBe(1) // Fay
  })

  it('ring radii increase monotonically with at least 65px gap', () => {
    const invites = makeInvites(10)
    const layout = buildGraphLayout({ filmInvites: invites })
    for (let i = 2; i < layout.ringRadii.length; i++) {
      expect(layout.ringRadii[i]).toBeGreaterThanOrEqual(layout.ringRadii[i - 1] + 65)
    }
  })

  it('all node IDs are unique', () => {
    const invites = makeInvites(20)
    const layout = buildGraphLayout({ filmInvites: invites })
    const ids = layout.nodesData.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every link references valid node IDs', () => {
    const invites = makeInvites(10)
    const layout = buildGraphLayout({ filmInvites: invites })
    const ids = new Set(layout.nodesData.map((n) => n.id))
    for (const link of layout.linksData) {
      expect(ids.has(link.source)).toBe(true)
      expect(ids.has(link.target)).toBe(true)
    }
  })

  it('nodes on the same ring are at the correct radius', () => {
    const invites = makeInvites(8)
    const layout = buildGraphLayout({ filmInvites: invites })
    const root = layout.nodesData.find((n) => n.tier === 0)
    for (const n of layout.nodesData) {
      if (n.tier === 0) continue
      const r = layout.ringRadii[n.tier]
      if (!r) continue
      const d = dist(n, root)
      expect(d).toBeCloseTo(r, 0)
    }
  })

  it('has zero crossing links in a multi-ring chain', () => {
    // Build a deeper chain: 3 senders, each invitee re-shares
    const invites = [
      { id: 'a1', film_id: 'f', sender_name: 'S', sender_email: 's@x.com', sender_id: 'u0', recipient_name: 'A', recipient_email: 'a@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:00:00Z' },
      { id: 'a2', film_id: 'f', sender_name: 'S', sender_email: 's@x.com', sender_id: 'u0', recipient_name: 'B', recipient_email: 'b@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:01:00Z' },
      { id: 'a3', film_id: 'f', sender_name: 'S', sender_email: 's@x.com', sender_id: 'u0', recipient_name: 'C', recipient_email: 'c@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:02:00Z' },
      { id: 'a4', film_id: 'f', sender_name: 'S', sender_email: 's@x.com', sender_id: 'u0', recipient_name: 'D', recipient_email: 'd@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:03:00Z' },
      // Ring 2
      { id: 'b1', film_id: 'f', sender_name: 'A', sender_email: 'a@x.com', sender_id: 'u1', recipient_name: 'E', recipient_email: 'e@x.com', status: 'sent', parent_invite_id: 'a1', created_at: '2025-01-02T00:00:00Z' },
      { id: 'b2', film_id: 'f', sender_name: 'A', sender_email: 'a@x.com', sender_id: 'u1', recipient_name: 'F', recipient_email: 'f@x.com', status: 'sent', parent_invite_id: 'a1', created_at: '2025-01-02T00:01:00Z' },
      { id: 'b3', film_id: 'f', sender_name: 'C', sender_email: 'c@x.com', sender_id: 'u3', recipient_name: 'G', recipient_email: 'g@x.com', status: 'sent', parent_invite_id: 'a3', created_at: '2025-01-02T00:02:00Z' },
      { id: 'b4', film_id: 'f', sender_name: 'D', sender_email: 'd@x.com', sender_id: 'u4', recipient_name: 'H', recipient_email: 'h@x.com', status: 'sent', parent_invite_id: 'a4', created_at: '2025-01-02T00:03:00Z' },
      // Ring 3
      { id: 'c1', film_id: 'f', sender_name: 'E', sender_email: 'e@x.com', sender_id: 'u5', recipient_name: 'I', recipient_email: 'i@x.com', status: 'sent', parent_invite_id: 'b1', created_at: '2025-01-03T00:00:00Z' },
      { id: 'c2', film_id: 'f', sender_name: 'G', sender_email: 'g@x.com', sender_id: 'u7', recipient_name: 'J', recipient_email: 'j@x.com', status: 'sent', parent_invite_id: 'b3', created_at: '2025-01-03T00:01:00Z' },
    ]

    const layout = buildGraphLayout({ filmInvites: invites })
    expect(layout).not.toBeNull()
    const crossings = countCrossings(layout.nodesData, layout.linksData)
    expect(crossings).toBe(0)
  })

  it('viewBox auto-expands to fit all nodes', () => {
    const invites = makeInvites(50)
    const layout = buildGraphLayout({ filmInvites: invites })
    for (const n of layout.nodesData) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(layout.viewBoxW)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeLessThanOrEqual(layout.viewBoxH)
    }
  })

  it('highlights viewer node and outward children when viewerRecipientKey is set', () => {
    const invites = [
      { id: 'i1', film_id: 'f', sender_name: 'S', sender_email: 's@x.com', sender_id: 'u0', recipient_name: 'A', recipient_email: 'a@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:00:00Z' },
      { id: 'i2', film_id: 'f', sender_name: 'A', sender_email: 'a@x.com', sender_id: 'u1', recipient_name: 'B', recipient_email: 'b@x.com', status: 'sent', parent_invite_id: 'i1', created_at: '2025-01-02T00:00:00Z' },
      { id: 'i3', film_id: 'f', sender_name: 'A', sender_email: 'a@x.com', sender_id: 'u1', recipient_name: 'C', recipient_email: 'c@x.com', status: 'sent', parent_invite_id: 'i1', created_at: '2025-01-02T01:00:00Z' },
    ]
    // Viewer is A (ring 1), who has children B and C on ring 2
    const viewerKey = 'a@x.com:a'
    const layout = buildGraphLayout({ filmInvites: invites, viewerRecipientKey: viewerKey })
    expect(layout.defaultActiveNodes.size).toBeGreaterThan(0)
    expect(layout.defaultActiveNodes.has(viewerKey)).toBe(true)
    // Should highlight outward links to children
    expect(layout.defaultActiveLinks.size).toBeGreaterThan(0)
  })

  it('handles single invite gracefully', () => {
    const invites = makeInvites(1)
    const layout = buildGraphLayout({ filmInvites: invites })
    expect(layout).not.toBeNull()
    expect(layout.nodesData.length).toBe(2) // film + 1 invitee
    expect(layout.linksData.length).toBe(1)
  })

  it('groups ring-1 by sender into separate team sections', () => {
    const invites = [
      { id: 'i1', film_id: 'f', sender_name: 'Alice', sender_email: 'a@x.com', sender_id: 'u1', recipient_name: 'X', recipient_email: 'x@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:00:00Z' },
      { id: 'i2', film_id: 'f', sender_name: 'Alice', sender_email: 'a@x.com', sender_id: 'u1', recipient_name: 'Y', recipient_email: 'y@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:01:00Z' },
      { id: 'i3', film_id: 'f', sender_name: 'Bob', sender_email: 'b@x.com', sender_id: 'u2', recipient_name: 'Z', recipient_email: 'z@x.com', status: 'sent', parent_invite_id: null, created_at: '2025-01-01T00:02:00Z' },
    ]
    const layout = buildGraphLayout({ filmInvites: invites })
    expect(layout.sectionLabels.length).toBe(2) // Alice and Bob
    const labels = layout.sectionLabels.map((s) => s.label).sort()
    expect(labels).toEqual(['Alice', 'Bob'])
  })

  it('nodes on the same ring maintain at least 32px spacing', () => {
    const invites = makeInvites(30)
    const layout = buildGraphLayout({ filmInvites: invites })
    const ring1 = layout.nodesData.filter((n) => n.tier === 1)
    for (let i = 0; i < ring1.length; i++) {
      for (let j = i + 1; j < ring1.length; j++) {
        expect(dist(ring1[i], ring1[j])).toBeGreaterThanOrEqual(31)
      }
    }
  })
})
