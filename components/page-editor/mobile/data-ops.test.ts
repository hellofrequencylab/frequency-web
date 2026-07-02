import { describe, it, expect } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import {
  addBlock,
  removeBlock,
  insertBlockAt,
  moveBlock,
  updateBlockProps,
  findBlock,
  itemId,
  makeItem,
  derivePickerGroups,
  blockTitle,
  blockSummary,
} from './data-ops'

// A tiny fixture config, shaped like lib/page-editor/config.tsx (label + defaultProps
// + categories) but with no React render, so the pure ops are tested in isolation.
const config = {
  components: {
    Heading: { label: 'Heading', defaultProps: { title: 'Section heading' } },
    Text: { label: 'Text', defaultProps: { body: 'Some copy' } },
    Divider: { label: 'Divider', defaultProps: {} },
    Loose: { label: 'Loose block', defaultProps: {} },
  },
  categories: {
    content: { title: 'Content', components: ['Heading', 'Text'] },
    layout: { title: 'Layout', components: ['Divider'] },
    // References a non-existent component — must be ignored, not crash.
    ghost: { title: 'Ghost', components: ['DoesNotExist'] },
  },
} as unknown as Config

const seed = (): Data => ({
  root: {},
  content: [
    { type: 'Heading', props: { id: 'a', title: 'One' } },
    { type: 'Text', props: { id: 'b', body: 'Two' } },
    { type: 'Divider', props: { id: 'c' } },
  ],
})

describe('addBlock', () => {
  it('appends a defaulted block with a fresh id and returns it', () => {
    const d0 = seed()
    const { data, id } = addBlock(d0, config, 'Text')
    expect(data.content).toHaveLength(4)
    expect(d0.content).toHaveLength(3) // original untouched
    const added = data.content[3]
    expect(added.type).toBe('Text')
    expect((added.props as { body?: string }).body).toBe('Some copy')
    expect(itemId(added)).toBe(id)
    expect(id).toMatch(/^Text-/)
  })

  it('gives each added block a distinct id', () => {
    const a = addBlock(seed(), config, 'Divider')
    const b = addBlock(a.data, config, 'Divider')
    expect(a.id).not.toBe(b.id)
  })

  it('throws on an unknown type', () => {
    expect(() => makeItem(config, 'Nope')).toThrow(/Unknown block type/)
  })
})

describe('removeBlock + insertBlockAt (undo)', () => {
  it('removes by id and reports the original index', () => {
    const { data, removed, index } = removeBlock(seed(), 'b')
    expect(index).toBe(1)
    expect(removed && itemId(removed)).toBe('b')
    expect(data.content.map(itemId)).toEqual(['a', 'c'])
  })

  it('is a no-op for an unknown id', () => {
    const d0 = seed()
    const { data, removed, index } = removeBlock(d0, 'zzz')
    expect(removed).toBeNull()
    expect(index).toBe(-1)
    expect(data.content).toHaveLength(3)
  })

  it('round-trips: remove then re-insert restores the exact order', () => {
    const d0 = seed()
    const { data, removed, index } = removeBlock(d0, 'b')
    const restored = insertBlockAt(data, removed!, index)
    expect(restored.content.map(itemId)).toEqual(['a', 'b', 'c'])
  })
})

describe('moveBlock', () => {
  it('reorders from -> to', () => {
    const d = moveBlock(seed(), 0, 2)
    expect(d.content.map(itemId)).toEqual(['b', 'c', 'a'])
  })

  it('clamps out-of-range indices instead of dropping items', () => {
    const d = moveBlock(seed(), 0, 99)
    expect(d.content.map(itemId)).toEqual(['b', 'c', 'a'])
    expect(d.content).toHaveLength(3)
  })

  it('is a no-op when from === to', () => {
    const d0 = seed()
    expect(moveBlock(d0, 1, 1)).toBe(d0)
  })
})

describe('updateBlockProps', () => {
  it('merges a patch, preserves other props and the id', () => {
    const d = updateBlockProps(seed(), 'a', { title: 'Changed' })
    const it = findBlock(d, 'a')!
    expect((it.props as { title: string }).title).toBe('Changed')
    expect(itemId(it)).toBe('a')
  })

  it('does not touch other blocks', () => {
    const d = updateBlockProps(seed(), 'a', { title: 'Changed' })
    expect((findBlock(d, 'b')!.props as { body: string }).body).toBe('Two')
  })

  it('cannot be tricked into changing the id via the patch', () => {
    const d = updateBlockProps(seed(), 'a', { id: 'hacked', title: 'x' })
    expect(findBlock(d, 'a')).not.toBeNull()
    expect(findBlock(d, 'hacked')).toBeNull()
  })
})

describe('derivePickerGroups', () => {
  it('groups components by category and derives labels', () => {
    const groups = derivePickerGroups(config)
    const content = groups.find((g) => g.key === 'content')!
    expect(content.title).toBe('Content')
    expect(content.items).toEqual([
      { type: 'Heading', label: 'Heading' },
      { type: 'Text', label: 'Text' },
    ])
  })

  it('skips categories that reference no real component', () => {
    const groups = derivePickerGroups(config)
    expect(groups.find((g) => g.key === 'ghost')).toBeUndefined()
  })

  it('collects components with no category into a "More" group', () => {
    const groups = derivePickerGroups(config)
    const more = groups.find((g) => g.key === '__other')!
    expect(more.items.map((i) => i.type)).toEqual(['Loose'])
  })
})

describe('block labels + summaries', () => {
  it('titles a row from the config label', () => {
    expect(blockTitle(config, seed().content[0])).toBe('Heading')
  })

  it('summarizes from the first non-empty string prop, skipping id', () => {
    expect(blockSummary(seed().content[0])).toBe('One')
    expect(blockSummary({ type: 'Divider', props: { id: 'c' } })).toBe('')
  })
})
