import { describe, it, expect } from 'vitest'
import {
  builderLeafOrder,
  builderSegments,
  childrenInOrder,
  laneOf,
  moveTo,
  moveWithin,
  planSiblingOrder,
  type OrderedBlock,
} from './block-order'
import { buildJourneyTree, type BlockRow } from './tree'

// LIVE-689: one stored order for every Journey block. What is locked here:
//
//   1. THE BUILDER DRAWS WHAT THE MEMBER READS. A practice stored between two lessons is drawn
//      between them (no "practices last" group), a module sits in its place among the steps, and
//      the builder's reading order equals the player's `lessonOrder` for the same rows.
//   2. A REORDER MOVES PRACTICES AND LESSONS ALIKE, within a lane, writing only the rows that move.
//   3. A STALE OR FORGED ORDER WRITES NOTHING.

const blk = (id: string, parentId: string | null, blockType: string, sortOrder: number): OrderedBlock => ({
  id,
  parentId,
  blockType,
  sortOrder,
})

const toRows = (blocks: OrderedBlock[]): BlockRow[] =>
  blocks.map((b) => ({
    id: b.id,
    parent_id: b.parentId,
    block_type: b.blockType,
    sort_order: b.sortOrder,
    title: b.id,
    required: true,
    est_minutes: null,
    practice_id: b.blockType === 'practice' ? `practice-of-${b.id}` : null,
  }))

// A phase whose stored order interleaves practices, lessons and a module.
const JOURNEY: OrderedBlock[] = [
  blk('p1', null, 'phase', 0),
  blk('breathe', 'p1', 'practice', 0),
  blk('intro', 'p1', 'lesson', 1),
  blk('walk', 'p1', 'practice', 2),
  blk('m1', 'p1', 'module', 3),
  blk('m1-read', 'm1', 'reading', 0),
  blk('m1-sit', 'm1', 'practice', 1),
  blk('recap', 'p1', 'check', 4),
  blk('p2', null, 'phase', 1),
  blk('p2-sit', 'p2', 'practice', 0),
  blk('opening', null, 'lesson', 2),
]

describe('the builder draws the stored order (LIVE-689)', () => {
  it('interleaves practices with lessons and puts each module in its place', () => {
    const segs = builderSegments(childrenInOrder(JOURNEY, 'p1'))
    expect(segs.map((s) => (s.kind === 'leaves' ? s.items.map((b) => b.id) : `module:${s.block.id}`))).toEqual([
      ['breathe', 'intro', 'walk'],
      'module:m1',
      ['recap'],
    ])
  })

  it("the builder's reading order is the member's reading order", () => {
    const order = builderLeafOrder(JOURNEY)
    expect(order).toEqual(['opening', 'breathe', 'intro', 'walk', 'm1-read', 'm1-sit', 'recap', 'p2-sit'])
    expect(order).toEqual(buildJourneyTree(toRows(JOURNEY), []).lessonOrder)
  })

  it('a reorder that puts a practice between two lessons shows up in the player', () => {
    const lane = childrenInOrder(JOURNEY, 'p1').map((b) => ({ id: b.id, sort_order: b.sortOrder }))
    // Drag the lesson "intro" above the practice "breathe", then the check "recap" above "walk".
    const once = moveTo(lane.map((r) => r.id), 'intro', 'breathe') as string[]
    const twice = moveTo(once, 'recap', 'walk') as string[]
    const writes = planSiblingOrder(lane, twice) as NonNullable<ReturnType<typeof planSiblingOrder>>
    const after = JOURNEY.map((b) => {
      const w = writes.find((x) => x.id === b.id)
      return w ? { ...b, sortOrder: w.to } : b
    })
    expect(buildJourneyTree(toRows(after), []).lessonOrder).toEqual([
      'opening', 'intro', 'breathe', 'recap', 'walk', 'm1-read', 'm1-sit', 'p2-sit',
    ])
    expect(builderLeafOrder(after)).toEqual(buildJourneyTree(toRows(after), []).lessonOrder)
  })
})

describe('lanes', () => {
  it('splits the top level into phases and loose steps; everything under a parent is one lane', () => {
    expect(laneOf(null, 'phase')).toBe('phases')
    expect(laneOf(null, 'lesson')).toBe('steps')
    expect(laneOf(null, 'practice')).toBe('steps')
    expect(laneOf('p1', 'practice')).toBe('children')
    expect(laneOf('p1', 'module')).toBe('children')
    expect(laneOf('p1', 'lesson')).toBe('children')
  })
})

describe('moveWithin / moveTo', () => {
  it('moves one place and refuses past the edge', () => {
    expect(moveWithin(['a', 'b', 'c'], 'c', 'up')).toEqual(['a', 'c', 'b'])
    expect(moveWithin(['a', 'b', 'c'], 'a', 'down')).toEqual(['b', 'a', 'c'])
    expect(moveWithin(['a', 'b', 'c'], 'a', 'up')).toBeNull()
    expect(moveWithin(['a', 'b', 'c'], 'c', 'down')).toBeNull()
    expect(moveWithin(['a', 'b'], 'z', 'up')).toBeNull()
  })

  it('a drag puts the row where the target is, both directions', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveTo(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveTo(['a', 'b'], 'a', 'a')).toBeNull()
    expect(moveTo(['a', 'b'], 'a', 'z')).toBeNull()
  })
})

describe('planSiblingOrder', () => {
  const lane = [
    { id: 'breathe', sort_order: 0 },
    { id: 'intro', sort_order: 1 },
    { id: 'walk', sort_order: 2 },
  ]

  it('an adjacent swap of a practice and a lesson writes exactly those two rows', () => {
    expect(planSiblingOrder(lane, ['intro', 'breathe', 'walk'])).toEqual([
      { id: 'breathe', from: 0, to: 1 },
      { id: 'intro', from: 1, to: 0 },
    ])
  })

  it('keeps the lane on the slots it already holds, so rows outside the lane keep theirs', () => {
    const gappy = [
      { id: 'a', sort_order: 2 },
      { id: 'b', sort_order: 5 },
      { id: 'c', sort_order: 9 },
    ]
    expect(planSiblingOrder(gappy, ['c', 'a', 'b'])).toEqual([
      { id: 'a', from: 2, to: 5 },
      { id: 'b', from: 5, to: 9 },
      { id: 'c', from: 9, to: 2 },
    ])
  })

  it('repairs a tied slot by renumbering the lane from its lowest slot', () => {
    const tied = [
      { id: 'a', sort_order: 3 },
      { id: 'b', sort_order: 3 },
      { id: 'c', sort_order: 4 },
    ]
    expect(planSiblingOrder(tied, ['b', 'a', 'c'])).toEqual([
      { id: 'a', from: 3, to: 4 },
      { id: 'c', from: 4, to: 5 },
    ])
  })

  it('the same order writes nothing', () => {
    expect(planSiblingOrder(lane, ['breathe', 'intro', 'walk'])).toEqual([])
  })

  it('a missing, extra, foreign or repeated id is refused', () => {
    expect(planSiblingOrder(lane, ['intro', 'breathe'])).toBeNull()
    expect(planSiblingOrder(lane, ['intro', 'breathe', 'walk', 'x'])).toBeNull()
    expect(planSiblingOrder(lane, ['intro', 'breathe', 'x'])).toBeNull()
    expect(planSiblingOrder(lane, ['intro', 'intro', 'walk'])).toBeNull()
  })
})
