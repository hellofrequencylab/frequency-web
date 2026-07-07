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
  slotFieldsFor,
  findBlockDeep,
  updateBlockPropsDeep,
  removeBlockDeep,
  nudgeBlock,
  duplicateBlockDeep,
  addBlockToSlot,
  moveBlockTo,
  buildOutline,
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

// ── Slot-aware (deep) operations ──────────────────────────────────────────────
// A fixture with real `slot`-typed fields (Container.content, Columns.col1/col2),
// so the nested-tree ops are exercised on the exact shape lib/page-editor/config.tsx
// produces (nested blocks live at props[slotKey] as arrays).
const slotConfig = {
  components: {
    Heading: { label: 'Heading', defaultProps: { title: 'Section heading' } },
    Text: { label: 'Text', defaultProps: { body: 'Some copy' } },
    Container: {
      label: 'Container',
      fields: { content: { type: 'slot' } },
      defaultProps: { content: [] },
    },
    Columns: {
      label: 'Columns',
      fields: { col1: { type: 'slot', label: 'Column 1' }, col2: { type: 'slot', label: 'Column 2' } },
      defaultProps: { col1: [], col2: [] },
    },
  },
} as unknown as Config

// Container[c] { content: [ Heading[h], Columns[cols] { col1: [Text[t]], col2: [] } ] }
const nested = (): Data => ({
  root: {},
  content: [
    {
      type: 'Container',
      props: {
        id: 'c',
        content: [
          { type: 'Heading', props: { id: 'h', title: 'Nested heading' } },
          {
            type: 'Columns',
            props: {
              id: 'cols',
              col1: [{ type: 'Text', props: { id: 't', body: 'In a column' } }],
              col2: [],
            },
          },
        ],
      },
    },
    { type: 'Heading', props: { id: 'top', title: 'Top level' } },
  ],
})

// Read a nested slot array off a doc for assertions.
const slotOf = (data: Data, id: string, key: string): Data['content'] =>
  ((findBlockDeep(data, slotConfig, id)?.props as Record<string, unknown>)?.[key] as Data['content']) ?? []

describe('slotFieldsFor', () => {
  it('lists a block type’s slot regions with labels (falling back to the key)', () => {
    expect(slotFieldsFor(slotConfig, 'Container')).toEqual([{ key: 'content', label: 'content' }])
    expect(slotFieldsFor(slotConfig, 'Columns')).toEqual([
      { key: 'col1', label: 'Column 1' },
      { key: 'col2', label: 'Column 2' },
    ])
    expect(slotFieldsFor(slotConfig, 'Heading')).toEqual([])
  })
})

describe('findBlockDeep', () => {
  it('finds top-level, one-deep, and two-deep blocks', () => {
    expect(itemId(findBlockDeep(nested(), slotConfig, 'top')!)).toBe('top')
    expect(itemId(findBlockDeep(nested(), slotConfig, 'h')!)).toBe('h')
    expect(itemId(findBlockDeep(nested(), slotConfig, 't')!)).toBe('t')
    expect(findBlockDeep(nested(), slotConfig, 'nope')).toBeNull()
  })
})

describe('updateBlockPropsDeep', () => {
  it('patches a deeply nested block and preserves its id + siblings', () => {
    const d = updateBlockPropsDeep(nested(), slotConfig, 't', { body: 'Changed' })
    expect((findBlockDeep(d, slotConfig, 't')!.props as { body: string }).body).toBe('Changed')
    expect(itemId(findBlockDeep(d, slotConfig, 't')!)).toBe('t')
    // Untouched elsewhere.
    expect((findBlockDeep(d, slotConfig, 'h')!.props as { title: string }).title).toBe('Nested heading')
  })

  it('cannot be tricked into changing a nested id', () => {
    const d = updateBlockPropsDeep(nested(), slotConfig, 't', { id: 'hacked', body: 'x' })
    expect(findBlockDeep(d, slotConfig, 't')).not.toBeNull()
    expect(findBlockDeep(d, slotConfig, 'hacked')).toBeNull()
  })
})

describe('removeBlockDeep', () => {
  it('removes a nested block from its own slot', () => {
    const { data, removed } = removeBlockDeep(nested(), slotConfig, 't')
    expect(itemId(removed!)).toBe('t')
    expect(slotOf(data, 'cols', 'col1')).toHaveLength(0)
    // Container + its Heading survive.
    expect(findBlockDeep(data, slotConfig, 'h')).not.toBeNull()
  })

  it('is a no-op for an unknown id', () => {
    const { data, removed } = removeBlockDeep(nested(), slotConfig, 'zzz')
    expect(removed).toBeNull()
    expect(findBlockDeep(data, slotConfig, 'c')).not.toBeNull()
  })
})

describe('nudgeBlock', () => {
  it('reorders within a nested slot (Container.content: swap Heading + Columns)', () => {
    const before = slotOf(nested(), 'c', 'content').map(itemId)
    expect(before).toEqual(['h', 'cols'])
    const d = nudgeBlock(nested(), slotConfig, 'h', 1)
    expect(slotOf(d, 'c', 'content').map(itemId)).toEqual(['cols', 'h'])
  })

  it('clamps at the ends of a region (no-op)', () => {
    const d = nudgeBlock(nested(), slotConfig, 'top', 1) // already last at top level
    expect(d.content.map(itemId)).toEqual(['c', 'top'])
  })
})

describe('duplicateBlockDeep', () => {
  it('duplicates a subtree with fresh ids for it and every descendant', () => {
    const { data, id } = duplicateBlockDeep(nested(), slotConfig, 'cols')
    // The clone sits right after the original in Container.content.
    const ids = slotOf(data, 'c', 'content').map(itemId)
    expect(ids).toEqual(['h', 'cols', id])
    expect(id).not.toBe('cols')
    // The clone's nested Text has a NEW id (no collision with the original 't').
    const clone = findBlockDeep(data, slotConfig, id)!
    const cloneCol1 = (clone.props as Record<string, unknown>).col1 as Data['content']
    expect(cloneCol1).toHaveLength(1)
    expect(itemId(cloneCol1[0])).not.toBe('t')
    // Original 't' is still there and distinct.
    expect(findBlockDeep(data, slotConfig, 't')).not.toBeNull()
  })
})

describe('addBlockToSlot', () => {
  it('appends a defaulted block into a named slot', () => {
    const { data, id } = addBlockToSlot(nested(), slotConfig, 'cols', 'col2', 'Text')
    const col2 = slotOf(data, 'cols', 'col2')
    expect(col2).toHaveLength(1)
    expect(itemId(col2[0])).toBe(id)
    expect((col2[0].props as { body: string }).body).toBe('Some copy')
  })

  it('is a no-op (empty id) for an unknown parent', () => {
    const { data, id } = addBlockToSlot(nested(), slotConfig, 'ghost', 'content', 'Text')
    expect(id).toBe('')
    expect(data).toEqual(nested())
  })
})

describe('moveBlockTo', () => {
  it('moves a top-level block into a nested slot', () => {
    const d = moveBlockTo(nested(), slotConfig, 'top', { parentId: 'cols', slotKey: 'col2', index: 0 })
    expect(d.content.map(itemId)).toEqual(['c']) // left the top level
    expect(slotOf(d, 'cols', 'col2').map(itemId)).toEqual(['top'])
  })

  it('moves a nested block back out to the top level at a given index', () => {
    const d = moveBlockTo(nested(), slotConfig, 't', { parentId: null, slotKey: null, index: 0 })
    expect(d.content.map(itemId)).toEqual(['t', 'c', 'top'])
    expect(slotOf(d, 'cols', 'col1')).toHaveLength(0)
  })

  it('refuses to drop a block into its own descendant (would detach the subtree)', () => {
    const d = moveBlockTo(nested(), slotConfig, 'c', { parentId: 'cols', slotKey: 'col1', index: 0 })
    expect(d).toEqual(nested()) // unchanged
  })
})

describe('editor op sequence preserves the persisted Data shape', () => {
  // Every stored block must stay `{ type: string, props: { id: string, ... } }` with
  // slot regions as arrays of the same, and ids must stay globally unique — the
  // byte-for-byte contract the desktop editor must never break (no doc migration).
  const assertShape = (data: Data) => {
    expect(Array.isArray(data.content)).toBe(true)
    const ids: string[] = []
    const walk = (items: Data['content']) => {
      for (const it of items) {
        expect(typeof it.type).toBe('string')
        expect(it.props).toBeTypeOf('object')
        const id = (it.props as { id?: unknown }).id
        expect(typeof id).toBe('string')
        expect(String(id)).not.toBe('')
        ids.push(String(id))
        for (const s of slotFieldsFor(slotConfig, it.type)) {
          const arr = (it.props as Record<string, unknown>)[s.key]
          if (arr !== undefined) {
            expect(Array.isArray(arr)).toBe(true)
            walk(arr as Data['content'])
          }
        }
      }
    }
    walk(data.content)
    expect(new Set(ids).size).toBe(ids.length) // all ids unique
  }

  it('add → edit → duplicate → nudge → add-to-slot → move → remove stays a valid doc', () => {
    let d = nested()
    assertShape(d)

    d = addBlock(d, slotConfig, 'Heading').data
    d = updateBlockPropsDeep(d, slotConfig, 't', { body: 'edited deep' })
    d = duplicateBlockDeep(d, slotConfig, 'cols').data
    d = nudgeBlock(d, slotConfig, 'h', 1)
    d = addBlockToSlot(d, slotConfig, 'cols', 'col2', 'Text').data
    d = moveBlockTo(d, slotConfig, 'top', { parentId: 'c', slotKey: 'content', index: 0 })
    d = removeBlockDeep(d, slotConfig, 'h').data

    assertShape(d)
    // root is untouched throughout.
    expect(d.root).toEqual({})
  })
})

describe('buildOutline', () => {
  it('mirrors the document as a tree of nodes + slot regions', () => {
    const tree = buildOutline(nested(), slotConfig)
    expect(tree.map((n) => n.id)).toEqual(['c', 'top'])
    const container = tree[0]
    expect(container.slots.map((s) => s.key)).toEqual(['content'])
    const contentChildren = container.slots[0].children
    expect(contentChildren.map((n) => n.id)).toEqual(['h', 'cols'])
    const cols = contentChildren[1]
    expect(cols.slots.map((s) => s.key)).toEqual(['col1', 'col2'])
    expect(cols.slots[0].children.map((n) => n.id)).toEqual(['t'])
    expect(cols.slots[1].children).toEqual([])
  })
})

// ── Per-page block limits: the palette annotates capped blocks + the add/duplicate ops refuse to
// exceed a cap (lib/page-editor/block-limits.ts). A "Blocks" category holds a design block (cap 3);
// a "profile" category holds a primary block (cap 1); "content" is unlimited.
const limitConfig = {
  components: {
    Zigzag: { label: 'Zigzag', defaultProps: {} },
    SpaceAbout: { label: 'About', defaultProps: {} },
    Text: { label: 'Text', defaultProps: {} },
  },
  categories: {
    blocks: { title: 'Blocks', components: ['Zigzag'] },
    profile: { title: 'Profile', components: ['SpaceAbout'] },
    content: { title: 'Content', components: ['Text'] },
  },
} as unknown as Config

const findItem = (groups: ReturnType<typeof derivePickerGroups>, type: string) =>
  groups.flatMap((g) => g.items).find((it) => it.type === type)

describe('derivePickerGroups with per-page limits', () => {
  it('leaves every item enabled when no data is passed', () => {
    const groups = derivePickerGroups(limitConfig)
    expect(findItem(groups, 'Zigzag')?.disabled).toBeUndefined()
    expect(findItem(groups, 'SpaceAbout')?.disabled).toBeUndefined()
  })
  it('disables a design block once it hits three, with a reason', () => {
    const data: Data = {
      root: {},
      content: [
        { type: 'Zigzag', props: { id: '1' } },
        { type: 'Zigzag', props: { id: '2' } },
        { type: 'Zigzag', props: { id: '3' } },
      ],
    }
    const item = findItem(derivePickerGroups(limitConfig, data), 'Zigzag')
    expect(item?.disabled).toBe(true)
    expect(item?.reason).toBeTruthy()
    // Under the cap it stays enabled.
    const twoItem = findItem(
      derivePickerGroups(limitConfig, { root: {}, content: data.content.slice(0, 2) }),
      'Zigzag',
    )
    expect(twoItem?.disabled).toBeUndefined()
  })
  it('disables a primary block once it is on the page', () => {
    const data: Data = { root: {}, content: [{ type: 'SpaceAbout', props: { id: '1' } }] }
    expect(findItem(derivePickerGroups(limitConfig, data), 'SpaceAbout')?.disabled).toBe(true)
  })
})

describe('addBlock / duplicateBlockDeep honor per-page limits', () => {
  const atCap = (): Data => ({
    root: {},
    content: [
      { type: 'Zigzag', props: { id: '1' } },
      { type: 'Zigzag', props: { id: '2' } },
      { type: 'Zigzag', props: { id: '3' } },
    ],
  })
  it('addBlock no-ops when the design block is at its cap', () => {
    const d = atCap()
    const { data, id } = addBlock(d, limitConfig, 'Zigzag')
    expect(id).toBe('')
    expect(data.content).toHaveLength(3)
  })
  it('addBlock still adds an unlimited block', () => {
    const { data, id } = addBlock(atCap(), limitConfig, 'Text')
    expect(id).not.toBe('')
    expect(data.content).toHaveLength(4)
  })
  it('duplicateBlockDeep no-ops when it would exceed the cap', () => {
    const d = atCap()
    const { data, id } = duplicateBlockDeep(d, limitConfig, '1')
    expect(id).toBe('')
    expect(data.content).toHaveLength(3)
  })
})
