import { describe, it, expect } from 'vitest'
import { filterPickerBlocks } from './block-picker'
import { blocksForKind } from '@/lib/entity-blocks/registry'

// The searchable block picker (ADR-516 Phase C) lists member blocks NOT already placed/hidden, grouped
// Suggested then All, filtered by query. filterPickerBlocks is the pure core (exclusion + grouping).

const palette = blocksForKind('member')

describe('filterPickerBlocks', () => {
  it('excludes already-placed (and hidden) blocks', () => {
    const taken = new Set(['about', 'stats'])
    const { suggested, all } = filterPickerBlocks(palette, taken, '')
    const ids = [...suggested, ...all].map((b) => b.id)
    expect(ids).not.toContain('about')
    expect(ids).not.toContain('stats')
    expect(ids).toContain('links')
  })

  it('splits into a Suggested head and an All tail with no query', () => {
    const { suggested, all } = filterPickerBlocks(palette, new Set(), '')
    expect(suggested.length).toBeGreaterThan(0)
    expect(suggested.length).toBeLessThanOrEqual(4)
    // No id appears in both groups.
    const overlap = suggested.filter((s) => all.some((a) => a.id === s.id))
    expect(overlap).toHaveLength(0)
  })

  it('a query flattens to one filtered result set (label or description match)', () => {
    const { suggested, all } = filterPickerBlocks(palette, new Set(), 'link')
    expect(suggested).toHaveLength(0)
    expect(all.some((b) => b.id === 'links')).toBe(true)
    expect(all.every((b) => /link/i.test(b.label) || /link/i.test(b.description))).toBe(true)
  })

  it('returns empty groups when every block is taken', () => {
    const taken = new Set(palette.map((b) => b.id))
    const { suggested, all } = filterPickerBlocks(palette, taken, '')
    expect(suggested).toHaveLength(0)
    expect(all).toHaveLength(0)
  })
})
