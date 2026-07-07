import { describe, it, expect } from 'vitest'
import type { Config, Data } from '@/lib/page-editor/types'
import {
  DESIGN_BLOCK_LIMIT,
  PRIMARY_BLOCK_LIMIT,
  DESIGN_BLOCK_TYPES,
  blockLimitFor,
  countByType,
  canAddBlock,
  blockLimitReason,
  primaryBlockTypes,
} from './block-limits'

// A fixture config mirroring lib/page-editor/config.tsx: a "Blocks" category holding the design
// blocks, a "profile" category (primary, one-per-page), a Container with a `slot` region so nested
// counting is exercised, and an unlimited primitive.
const config = {
  components: {
    PhotoHero: { label: 'Photo hero', defaultProps: {} },
    Zigzag: { label: 'Zigzag', defaultProps: {} },
    SpaceAbout: { label: 'About', defaultProps: {} },
    Text: { label: 'Text', defaultProps: {} },
    Container: {
      label: 'Container',
      defaultProps: {},
      fields: { content: { type: 'slot' } },
    },
  },
  categories: {
    blocks: { title: 'Blocks', components: [...DESIGN_BLOCK_TYPES] },
    profile: { title: 'Profile', components: ['SpaceAbout'] },
    content: { title: 'Content', components: ['Text'] },
  },
} as unknown as Config

const doc = (content: Data['content']): Data => ({ root: {}, content })

describe('blockLimitFor', () => {
  it('caps each design block at three', () => {
    for (const type of DESIGN_BLOCK_TYPES) expect(blockLimitFor(type, config)).toBe(DESIGN_BLOCK_LIMIT)
    expect(DESIGN_BLOCK_LIMIT).toBe(3)
  })
  it('caps a primary (profile category) block at one', () => {
    expect(blockLimitFor('SpaceAbout', config)).toBe(PRIMARY_BLOCK_LIMIT)
    expect(PRIMARY_BLOCK_LIMIT).toBe(1)
  })
  it('leaves other blocks unlimited (null)', () => {
    expect(blockLimitFor('Text', config)).toBeNull()
    expect(blockLimitFor('Container', config)).toBeNull()
  })
})

describe('primaryBlockTypes', () => {
  it('reads the primary categories from the config', () => {
    expect(primaryBlockTypes(config).has('SpaceAbout')).toBe(true)
    expect(primaryBlockTypes(config).has('PhotoHero')).toBe(false)
  })
})

describe('countByType', () => {
  it('counts top-level instances', () => {
    const counts = countByType(
      doc([
        { type: 'PhotoHero', props: { id: '1' } },
        { type: 'PhotoHero', props: { id: '2' } },
        { type: 'Text', props: { id: '3' } },
      ]),
      config,
    )
    expect(counts.PhotoHero).toBe(2)
    expect(counts.Text).toBe(1)
  })
  it('counts blocks nested inside a slot region', () => {
    const counts = countByType(
      doc([
        { type: 'Zigzag', props: { id: '1' } },
        {
          type: 'Container',
          props: { id: 'c', content: [{ type: 'Zigzag', props: { id: '2' } }] },
        },
      ]),
      config,
    )
    expect(counts.Zigzag).toBe(2)
  })
})

describe('canAddBlock', () => {
  it('allows a design block up to three, then blocks the fourth', () => {
    const three = doc([
      { type: 'Zigzag', props: { id: '1' } },
      { type: 'Zigzag', props: { id: '2' } },
      { type: 'Zigzag', props: { id: '3' } },
    ])
    expect(canAddBlock('Zigzag', doc([]), config)).toBe(true)
    expect(canAddBlock('Zigzag', three, config)).toBe(false)
  })
  it('allows a primary block once, then blocks the second', () => {
    expect(canAddBlock('SpaceAbout', doc([]), config)).toBe(true)
    expect(canAddBlock('SpaceAbout', doc([{ type: 'SpaceAbout', props: { id: '1' } }]), config)).toBe(false)
  })
  it('always allows an unlimited block', () => {
    const many = doc(Array.from({ length: 9 }, (_, i) => ({ type: 'Text', props: { id: String(i) } })))
    expect(canAddBlock('Text', many, config)).toBe(true)
  })
  it('counts nested instances toward the cap', () => {
    const nested = doc([
      { type: 'Zigzag', props: { id: '1' } },
      { type: 'Zigzag', props: { id: '2' } },
      { type: 'Container', props: { id: 'c', content: [{ type: 'Zigzag', props: { id: '3' } }] } },
    ])
    expect(canAddBlock('Zigzag', nested, config)).toBe(false)
  })
})

describe('blockLimitReason', () => {
  it('is null while under the cap', () => {
    expect(blockLimitReason('Zigzag', doc([]), config)).toBeNull()
    expect(blockLimitReason('Text', doc([]), config)).toBeNull()
  })
  it('gives a once-per-page reason for a primary block at cap', () => {
    const reason = blockLimitReason('SpaceAbout', doc([{ type: 'SpaceAbout', props: { id: '1' } }]), config)
    expect(reason).toBeTruthy()
    expect(reason).toMatch(/once per page/i)
    expect(reason).not.toContain('—') // voice canon: no em dashes
  })
  it('gives a max-count reason for a design block at cap', () => {
    const three = doc([
      { type: 'Zigzag', props: { id: '1' } },
      { type: 'Zigzag', props: { id: '2' } },
      { type: 'Zigzag', props: { id: '3' } },
    ])
    const reason = blockLimitReason('Zigzag', three, config)
    expect(reason).toContain('3')
    expect(reason).not.toContain('—')
  })
})
