import { describe, it, expect } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import {
  readBlockRows,
  visibleContent,
  withVisibleBlocks,
  moveBlock,
  setBlockHidden,
  withParkedBlocks,
} from './space-blocks'

// The Page quick-edit panel's block-list logic (reorder + show/hide of TOP-LEVEL blocks) is PURE, so
// it is locked here without a browser. The contract: reads produce a stable, labelled, ordered row
// list; reorder + hide return NEW arrays (never mutate); and the render-path filter strips both hidden
// blocks AND the flag off the survivors so the public renderer never sees a parked block or the flag.

const doc = (content: unknown[]): Data => ({ root: {}, content: content as Data['content'] })

describe('readBlockRows', () => {
  it('reads top-level blocks in order, labelling by heading, then config label, then type', () => {
    const rows = readBlockRows(
      doc([
        { type: 'SpaceLayout', props: { id: 'a' } },
        { type: 'SpaceOfferings', props: { id: 'b', heading: 'The catalog' } },
        { type: 'NotARealBlock', props: { id: 'c' } },
      ]),
    )
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    // SpaceOfferings uses its own heading; SpaceLayout falls back to its config label; unknown to type.
    expect(rows[1].label).toBe('The catalog')
    expect(rows[0].label).toBe('Layout box (main + side)')
    expect(rows[2].label).toBe('NotARealBlock')
  })

  it('falls back to a positional id when a block has no props.id', () => {
    const rows = readBlockRows(doc([{ type: 'SpaceLayout', props: {} }]))
    expect(rows[0].id).toBe('block-0')
  })

  it('reflects the hidden flag and tolerates a malformed doc', () => {
    const rows = readBlockRows(doc([{ type: 'SpaceCTA', props: { id: 'x' }, hidden: true }]))
    expect(rows[0].hidden).toBe(true)
    expect(readBlockRows(null)).toEqual([])
    expect(readBlockRows({ root: {} } as Data)).toEqual([])
  })
})

describe('moveBlock', () => {
  const content = [
    { type: 'A', props: { id: 'a' } },
    { type: 'B', props: { id: 'b' } },
    { type: 'C', props: { id: 'c' } },
  ]

  it('moves a block down and up, returning a new array without mutating', () => {
    const down = moveBlock(content, 0, 1)
    expect(down.map((b) => (b as { type: string }).type)).toEqual(['B', 'A', 'C'])
    const up = moveBlock(content, 2, -1)
    expect(up.map((b) => (b as { type: string }).type)).toEqual(['A', 'C', 'B'])
    // original untouched
    expect(content.map((b) => b.type)).toEqual(['A', 'B', 'C'])
  })

  it('clamps at the edges (no-op past an end)', () => {
    expect(moveBlock(content, 0, -1).map((b) => (b as { type: string }).type)).toEqual(['A', 'B', 'C'])
    expect(moveBlock(content, 2, 1).map((b) => (b as { type: string }).type)).toEqual(['A', 'B', 'C'])
  })
})

describe('setBlockHidden', () => {
  const content = [{ type: 'A', props: { id: 'a' } }, { type: 'B', props: { id: 'b' } }]

  it('sets the hidden flag, then clears it back to a clean block', () => {
    const hidden = setBlockHidden(content, 1, true)
    expect((hidden[1] as { hidden?: boolean }).hidden).toBe(true)
    expect((hidden[0] as { hidden?: boolean }).hidden).toBeUndefined()
    const cleared = setBlockHidden(hidden, 1, false)
    expect('hidden' in (cleared[1] as object)).toBe(false)
    // original untouched
    expect('hidden' in content[1]).toBe(false)
  })
})

describe('visibleContent / withVisibleBlocks (the render-path filter)', () => {
  it('drops hidden blocks and strips the flag off the survivors', () => {
    const out = visibleContent([
      { type: 'A', props: { id: 'a' } },
      { type: 'B', props: { id: 'b' }, hidden: true },
      { type: 'C', props: { id: 'c' }, hidden: false },
    ])
    expect(out.map((b) => b.type)).toEqual(['A', 'C'])
    expect(out.every((b) => !('hidden' in b))).toBe(true)
  })

  it('withVisibleBlocks returns a clean doc and tolerates a malformed one', () => {
    const cleaned = withVisibleBlocks(
      doc([{ type: 'A', props: { id: 'a' }, hidden: true }, { type: 'B', props: { id: 'b' } }]),
    )
    expect(cleaned.content.map((b) => b.type)).toEqual(['B'])
    const bad = { root: {} } as Data
    expect(withVisibleBlocks(bad)).toBe(bad)
  })
})

describe('withParkedBlocks (the publish-path merge)', () => {
  // The full editor never sees hidden blocks, so publishing its doc as-is would destroy them.
  // These lock the survival contract.
  const stored = doc([
    { type: 'A', props: { id: 'a' } },
    { type: 'PARKED', props: { id: 'p' }, hidden: true },
    { type: 'B', props: { id: 'b' } },
  ])

  it('carries a parked block back into a doc the editor returned without it', () => {
    const edited = doc([{ type: 'A', props: { id: 'a' } }, { type: 'B', props: { id: 'b' } }])
    const out = withParkedBlocks(stored, edited)
    expect(out.content.map((b) => b.type)).toEqual(['A', 'PARKED', 'B'])
    expect(out.content.find((b) => b.type === 'PARKED')).toMatchObject({ hidden: true })
  })

  it('keeps parked blocks when the editor reordered, added and removed the visible ones', () => {
    const edited = doc([{ type: 'B', props: { id: 'b' } }, { type: 'NEW', props: { id: 'n' } }])
    const out = withParkedBlocks(stored, edited)
    expect(out.content.map((b) => b.type)).toContain('PARKED')
    expect(out.content).toHaveLength(3)
  })

  it('restores several parked blocks in their original relative order', () => {
    const many = doc([
      { type: 'P1', props: { id: 'p1' }, hidden: true },
      { type: 'V', props: { id: 'v' } },
      { type: 'P2', props: { id: 'p2' }, hidden: true },
    ])
    const out = withParkedBlocks(many, doc([{ type: 'V', props: { id: 'v' } }]))
    const types = out.content.map((b) => b.type)
    expect(types.indexOf('P1')).toBeLessThan(types.indexOf('P2'))
    expect(types).toHaveLength(3)
  })

  it('clamps a parked index past the end of a shortened doc rather than dropping it', () => {
    const tail = doc([
      { type: 'A', props: { id: 'a' } },
      { type: 'B', props: { id: 'b' } },
      { type: 'PARKED', props: { id: 'p' }, hidden: true },
    ])
    const out = withParkedBlocks(tail, doc([]))
    expect(out.content.map((b) => b.type)).toEqual(['PARKED'])
  })

  it('returns the incoming doc untouched when there is nothing parked or no stored doc', () => {
    const edited = doc([{ type: 'A', props: { id: 'a' } }])
    expect(withParkedBlocks(doc([{ type: 'A', props: { id: 'a' } }]), edited)).toBe(edited)
    expect(withParkedBlocks(null, edited)).toBe(edited)
    expect(withParkedBlocks({ root: {} } as Data, edited)).toBe(edited)
  })
})
