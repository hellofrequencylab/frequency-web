import { describe, it, expect } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import {
  spotlightLayoutToPuck,
  puckToSpotlightLayout,
  SPOTLIGHT_PUCK_TYPES,
  SPOTLIGHT_PUCK_TYPE_SET,
} from './convert'
import { validateSpotlightLayout } from '@/lib/spotlight/blocks/validate'
import {
  type SpotlightLayout,
  type SpotlightBlock,
  SPOTLIGHT_LAYOUT_VERSION,
} from '@/lib/spotlight/blocks/schema'
import { linktreeComponents } from '@/components/page-editor/blocks/linktree'

// The migration-free bridge (lib/spotlight/puck/convert.ts). The core contract: a stored
// SpotlightLayout survives spotlightLayoutToPuck -> puckToSpotlightLayout UNCHANGED, so an
// existing spotlight renders + edits through Puck with no data loss and needs no migration.

// One block of EVERY type, with representative field values (a valid owner asset path, a
// valid embed ref, a per-block tint). This is the fixture the round-trip must preserve.
const OWNER = '00000000-0000-0000-0000-000000000000'
const FULL_LAYOUT: SpotlightLayout = {
  version: SPOTLIGHT_LAYOUT_VERSION,
  blocks: [
    { id: 'h1', type: 'heading', text: 'My page', level: 2, tint: { text: '#112233' } },
    { id: 't1', type: 'text', text: 'Hello there.\nSecond line.', tint: { bg: '#abcdef' } },
    { id: 'l1', type: 'links', items: [{ label: 'Site', url: 'https://example.com/' }, { label: 'IG', url: 'https://instagram.com/me' }], tint: { text: '#000000', bg: '#ffffff' } },
    { id: 'i1', type: 'image', assetPath: `${OWNER}/spotlight/pic.webp`, alt: 'me', focusX: 40, focusY: 60, zoom: 120 },
    { id: 'g1', type: 'gallery', items: [{ assetPath: `${OWNER}/spotlight/a.jpg`, alt: 'a', focusX: 50, focusY: 50, zoom: 100 }, { assetPath: `${OWNER}/spotlight/b.png`, alt: 'b', focusX: 20, focusY: 80, zoom: 150 }] },
    { id: 'q1', type: 'quote', text: 'A line worth sharing.', cite: 'Me', tint: { text: '#222222' } },
    { id: 's1', type: 'stats', show: ['zaps', 'streak', 'region'] },
    { id: 'f1', type: 'topfriends', title: 'My crew' },
    { id: 'e1', type: 'embed', provider: 'spotify', ref: 'track/4cOdK2wGLETKBW3PvgPWqT' },
    { id: 'd1', type: 'divider', tint: { text: '#333333' } },
  ] as SpotlightBlock[],
}

describe('spotlightLayoutToPuck', () => {
  it('produces a valid Puck Data document (root + content)', () => {
    const data = spotlightLayoutToPuck(FULL_LAYOUT)
    expect(data.root).toEqual({})
    expect(Array.isArray(data.content)).toBe(true)
    expect(data.content).toHaveLength(FULL_LAYOUT.blocks.length)
  })

  it('maps each block to its namespaced Spotlight Puck type', () => {
    const data = spotlightLayoutToPuck(FULL_LAYOUT)
    const types = data.content.map((c) => c.type)
    expect(types).toEqual([
      SPOTLIGHT_PUCK_TYPES.heading,
      SPOTLIGHT_PUCK_TYPES.text,
      SPOTLIGHT_PUCK_TYPES.links,
      SPOTLIGHT_PUCK_TYPES.image,
      SPOTLIGHT_PUCK_TYPES.gallery,
      SPOTLIGHT_PUCK_TYPES.quote,
      SPOTLIGHT_PUCK_TYPES.stats,
      SPOTLIGHT_PUCK_TYPES.topfriends,
      SPOTLIGHT_PUCK_TYPES.embed,
      SPOTLIGHT_PUCK_TYPES.divider,
    ])
  })

  it('carries the block id onto props.id (Puck stable key)', () => {
    const data = spotlightLayoutToPuck(FULL_LAYOUT)
    expect(data.content.map((c) => c.props.id)).toEqual(FULL_LAYOUT.blocks.map((b) => b.id))
  })

  it('empty layout -> empty document', () => {
    expect(spotlightLayoutToPuck({ version: SPOTLIGHT_LAYOUT_VERSION, blocks: [] })).toEqual({ root: {}, content: [] })
    expect(spotlightLayoutToPuck(null)).toEqual({ root: {}, content: [] })
    expect(spotlightLayoutToPuck(undefined)).toEqual({ root: {}, content: [] })
  })
})

describe('round-trip: layout -> Puck -> layout is lossless', () => {
  it('preserves every block of every type unchanged', () => {
    const puck = spotlightLayoutToPuck(FULL_LAYOUT)
    const back = puckToSpotlightLayout(puck)
    expect(back).toEqual(FULL_LAYOUT)
  })

  it('survives the read-side validator with no coercion (it was already valid)', () => {
    const puck = spotlightLayoutToPuck(FULL_LAYOUT)
    const back = puckToSpotlightLayout(puck)
    const validated = validateSpotlightLayout(back, OWNER)
    expect(validated).toEqual(FULL_LAYOUT)
  })

  it('stats `show` round-trips (flat array <-> editor {key} rows)', () => {
    const puck = spotlightLayoutToPuck(FULL_LAYOUT)
    const stats = puck.content.find((c) => c.type === SPOTLIGHT_PUCK_TYPES.stats)!
    // In Puck the show list is object rows so the array field can render a select each.
    expect(stats.props.show).toEqual([{ key: 'zaps' }, { key: 'streak' }, { key: 'region' }])
    const back = puckToSpotlightLayout(puck)
    const statBlock = back.blocks.find((b) => b.type === 'stats')!
    expect(statBlock).toEqual({ id: 's1', type: 'stats', show: ['zaps', 'streak', 'region'] })
  })
})

describe('puckToSpotlightLayout drops foreign blocks', () => {
  it('ignores a marketing block that has no Spotlight equivalent', () => {
    const mixed: Data = {
      root: {},
      content: [
        { type: SPOTLIGHT_PUCK_TYPES.text, props: { id: 't1', text: 'kept' } },
        { type: 'Hero', props: { id: 'x', title: 'dropped' } },
        { type: SPOTLIGHT_PUCK_TYPES.divider, props: { id: 'd1' } },
      ],
    }
    const back = puckToSpotlightLayout(mixed)
    expect(back.blocks.map((b) => b.type)).toEqual(['text', 'divider'])
  })

  it('tolerates a malformed / empty document', () => {
    expect(puckToSpotlightLayout(null).blocks).toEqual([])
    expect(puckToSpotlightLayout({ root: {}, content: [] as never }).blocks).toEqual([])
    expect(puckToSpotlightLayout({ root: {}, content: [null, 'x', 42] as never }).blocks).toEqual([])
  })
})

describe('the Spotlight block registry matches the converter', () => {
  it('every mapped Puck type is a registered block', () => {
    for (const type of Object.values(SPOTLIGHT_PUCK_TYPES)) {
      expect(linktreeComponents[type]).toBeTruthy()
    }
  })

  it('the type set equals the registry keys (no drift)', () => {
    expect(new Set(Object.keys(linktreeComponents))).toEqual(SPOTLIGHT_PUCK_TYPE_SET)
  })
})
