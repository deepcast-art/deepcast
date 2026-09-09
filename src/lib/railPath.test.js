import { describe, it, expect } from 'vitest'
import {
  railPathNodes,
  railPathPositions,
  RAIL_PATH_STROKE_OPACITY,
  railPathDescription,
  collapsedLabel,
  RAIL_PATH_INSET,
  RAIL_PATH_VIEWBOX,
  onwardLabel,
  onwardPeople,
} from './railPath.js'
import { chainHands } from './handsChain.js'

const labels = (nodes) => nodes.map((n) => n.label)
const types = (nodes) => nodes.map((n) => n.type)

describe('railPathNodes — the collapse rule and the label set (founder design 2026-09-09)', () => {
  it('1 hand: IEN (filmmaker) → YOU → ?', () => {
    const nodes = railPathNodes(['Ien'])
    expect(labels(nodes)).toEqual(['IEN', 'YOU', '?'])
    expect(types(nodes)).toEqual(['hand', 'you', 'next'])
    expect(nodes[0].caption).toBe('(FILMMAKER)')
    expect(nodes.slice(1).every((n) => n.caption === null)).toBe(true)
  })

  it('2 hands: IEN (filmmaker) → THEMBA → YOU → ?', () => {
    const nodes = railPathNodes(['Ien', 'Themba'])
    expect(labels(nodes)).toEqual(['IEN', 'THEMBA', 'YOU', '?'])
    expect(nodes[1].caption).toBeNull()
  })

  it('3 hands: every hand, no collapse', () => {
    const nodes = railPathNodes(['Ien', 'Priya', 'Dan'])
    expect(labels(nodes)).toEqual(['IEN', 'PRIYA', 'DAN', 'YOU', '?'])
    expect(types(nodes)).toEqual(['hand', 'hand', 'hand', 'you', 'next'])
  })

  it('4 hands: the first, "2 OTHERS", the last', () => {
    const nodes = railPathNodes(['Ien', 'Arielle', 'Krist', 'Alexander'])
    expect(labels(nodes)).toEqual(['IEN', '2 OTHERS', 'ALEXANDER', 'YOU', '?'])
    expect(types(nodes)).toEqual(['hand', 'collapsed', 'hand', 'you', 'next'])
    expect(nodes[0].caption).toBe('(FILMMAKER)')
    expect(nodes[2].caption).toBeNull()
  })

  it('6 hands: the first, "4 OTHERS", the last — the row never grows', () => {
    const nodes = railPathNodes(['Ien', 'B', 'C', 'D', 'E', 'Zeke'])
    expect(labels(nodes)).toEqual(['IEN', '4 OTHERS', 'ZEKE', 'YOU', '?'])
    expect(nodes).toHaveLength(5)
    expect(collapsedLabel(4)).toBe('4 OTHERS')
  })

  it('no hands (the filmmaker’s own page, depth 0): nothing', () => {
    expect(railPathNodes([])).toEqual([])
    expect(railPathNodes(null)).toEqual([])
    expect(railPathNodes(['', '  '])).toEqual([])
  })

  it('the "The filmmaker" fallback origin keeps its label whole and gets no caption', () => {
    const nodes = railPathNodes(chainHands(['The filmmaker', 'Dan']))
    expect(labels(nodes)).toEqual(['THE FILMMAKER', 'DAN', 'YOU', '?'])
    expect(nodes[0].caption).toBeNull()
  })

  it('reads the same hands rule as the emblem: the id-verified two-entry collapse', () => {
    const hands = chainHands(['Ien Chi', 'Ien Chi'], { senderIsCreator: true })
    expect(labels(railPathNodes(hands))).toEqual(['IEN', 'YOU', '?'])
  })
})

describe('railPathPositions — evenly spaced on one line, 30px inset', () => {
  it('spreads n nodes from the inset to the far inset', () => {
    expect(railPathPositions(3)).toEqual([30, 192, 354])
    expect(railPathPositions(4)).toEqual([30, 138, 246, 354])
    expect(railPathPositions(5)).toEqual([30, 111, 192, 273, 354])
  })
  it('first and last always sit on the insets, whatever the count', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const xs = railPathPositions(n)
      expect(xs[0]).toBe(RAIL_PATH_INSET)
      expect(xs[n - 1]).toBe(RAIL_PATH_VIEWBOX.width - RAIL_PATH_INSET)
    }
  })
  it('degenerate counts', () => {
    expect(railPathPositions(1)).toEqual([192])
    expect(railPathPositions(0)).toEqual([])
  })
})

describe('the line rule — one stroke for the whole path', () => {
  it('every segment reads at 0.55; there is no ramp constant left to drift', () => {
    expect(RAIL_PATH_STROKE_OPACITY).toBe(0.55)
  })
})

describe('railPathDescription — the accessible sentence', () => {
  it('names every stop', () => {
    expect(railPathDescription(railPathNodes(['Ien', 'Themba']))).toBe(
      'How this reached you: IEN (filmmaker) → THEMBA → you → ?'
    )
    expect(railPathDescription([])).toBe('')
  })
})

describe('the onward seat — the path after you share (founder design 2026-09-09)', () => {
  const HANDS = ['Ien', 'Themba']

  it('0 onward: the seat is the hollow "?" — unchanged', () => {
    const nodes = railPathNodes(HANDS, [])
    expect(labels(nodes)).toEqual(['IEN', 'THEMBA', 'YOU', '?'])
    expect(nodes[nodes.length - 1]).toEqual({ type: 'next', label: '?', caption: null })
    expect(railPathNodes(HANDS)).toEqual(nodes)
    expect(railPathNodes(HANDS, undefined)).toEqual(nodes)
    expect(railPathNodes(HANDS, null)).toEqual(nodes)
  })

  it('1 onward, unclaimed: their first name as typed, hollow — never "1 PERSON", never a "?" after it', () => {
    const nodes = railPathNodes(HANDS, [{ firstName: 'Maya', claimed: false }])
    expect(labels(nodes)).toEqual(['IEN', 'THEMBA', 'YOU', 'MAYA'])
    expect(types(nodes)).toEqual(['hand', 'hand', 'you', 'onward'])
    expect(nodes[3]).toEqual({ type: 'onward', label: 'MAYA', caption: null, claimed: false })
    expect(nodes.some((n) => n.type === 'next')).toBe(false)
  })

  it('1 onward, claimed: the same name, solid', () => {
    const nodes = railPathNodes(HANDS, [{ firstName: 'Maya', claimed: true }])
    expect(labels(nodes)).toEqual(['IEN', 'THEMBA', 'YOU', 'MAYA'])
    expect(nodes[3]).toMatchObject({ type: 'onward', claimed: true })
  })

  it('3 onward, mixed: "3 PEOPLE", solid the moment any one has claimed', () => {
    const nodes = railPathNodes(HANDS, [
      { firstName: 'Maya', claimed: false },
      { firstName: 'Joiselle', claimed: true },
      { firstName: 'Cal', claimed: false },
    ])
    expect(labels(nodes)).toEqual(['IEN', 'THEMBA', 'YOU', '3 PEOPLE'])
    expect(nodes[3]).toEqual({ type: 'onward', label: '3 PEOPLE', caption: null, claimed: true })
  })

  it('2 onward, none claimed: "2 PEOPLE", hollow', () => {
    const nodes = railPathNodes(HANDS, [
      { firstName: 'Maya', claimed: false },
      { firstName: 'Cal', claimed: false },
    ])
    expect(nodes[3]).toEqual({ type: 'onward', label: '2 PEOPLE', caption: null, claimed: false })
  })

  it('4 hands + 2 onward: the collapse applies before "you" only — five nodes, the onward node never collapsed or counted', () => {
    const nodes = railPathNodes(['Ien', 'Arielle', 'Krist', 'Alexander'], [
      { firstName: 'Maya', claimed: false },
      { firstName: 'Cal', claimed: true },
    ])
    expect(labels(nodes)).toEqual(['IEN', '2 OTHERS', 'ALEXANDER', 'YOU', '2 PEOPLE'])
    expect(types(nodes)).toEqual(['hand', 'collapsed', 'hand', 'you', 'onward'])
    expect(nodes).toHaveLength(5)
    expect(railPathPositions(nodes.length)).toEqual([30, 111, 192, 273, 354])
  })

  it('the label rule: one name uppercase; the word is PEOPLE', () => {
    expect(onwardLabel([{ firstName: 'maya', claimed: false }])).toBe('MAYA')
    expect(onwardLabel([{ firstName: 'Maya Rivera', claimed: false }])).toBe('MAYA')
    expect(onwardLabel([{ firstName: 'A' }, { firstName: 'B' }])).toBe('2 PEOPLE')
    expect(onwardLabel([])).toBe('')
    expect(onwardLabel(null)).toBe('')
  })

  it('an email is never a name; junk entries read as nobody', () => {
    expect(onwardPeople([{ firstName: 'maya@example.com', claimed: true }])).toEqual([{ firstName: 'Someone', claimed: true }])
    expect(onwardPeople([null, 'Maya', 3])).toEqual([])
    expect(onwardPeople('Maya')).toEqual([])
    expect(onwardPeople([{ firstName: 'Cal', claimed: 'yes' }])).toEqual([{ firstName: 'Cal', claimed: false }])
  })

  it('no hands (depth 0): still nothing, even with onward people', () => {
    expect(railPathNodes([], [{ firstName: 'Maya', claimed: false }])).toEqual([])
  })

  it('the accessible sentence names the onward seat and whether it has been claimed', () => {
    expect(railPathDescription(railPathNodes(HANDS, [{ firstName: 'Maya', claimed: false }]))).toBe(
      'How this reached you: IEN (filmmaker) → THEMBA → you → MAYA (not yet claimed)'
    )
    expect(railPathDescription(railPathNodes(HANDS, [{ firstName: 'Maya', claimed: true }, { firstName: 'Cal' }]))).toBe(
      'How this reached you: IEN (filmmaker) → THEMBA → you → 2 PEOPLE'
    )
  })
})
