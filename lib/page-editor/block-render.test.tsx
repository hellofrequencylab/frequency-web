import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Render as PuckRender } from '@measured/puck/rsc'
import type { Data, Metadata } from '@/lib/page-editor/types'
import { config } from '@/lib/page-editor/config'
import { BlockRender } from './block-render'

// ─────────────────────────────────────────────────────────────────────────────
// CORRECTNESS GATE — BlockRender must be byte-identical to Puck's own rsc <Render>.
//
// For each representative Data document we assert that
//   renderToStaticMarkup(<BlockRender .../>) === renderToStaticMarkup(<PuckRender .../>)
// using Puck's still-installed `@measured/puck/rsc` Render as the golden markup.
//
// The docs exercise: the config root wrapper, plain prop-driven blocks, metadata
// threading (top-level AND nested-in-slot, via LiveStats which reads
// puck.metadata.live), nested slots (Container / Columns / SpaceLayout), deep slot
// recursion, unknown-type skipping, and empty/malformed docs.
//
// All blocks chosen render purely from props/metadata (no next/link, next/image,
// router or Supabase context), so both renderers run cleanly under
// renderToStaticMarkup with no providers.
// ─────────────────────────────────────────────────────────────────────────────

type BlockItem = { type: string; props: Record<string, unknown> }

// Build a well-formed stored item: the block's own defaultProps + an id + overrides.
// Using defaultProps guarantees every field carries a valid value.
function item(type: string, id: string, overrides: Record<string, unknown> = {}): BlockItem {
  const defaults = (config.components as Record<string, { defaultProps?: Record<string, unknown> }>)[type]
    ?.defaultProps
  if (!defaults) throw new Error(`Unknown block type in test fixture: ${type}`)
  return { type, props: { id, ...defaults, ...overrides } }
}

const LIVE: Metadata = {
  live: {
    memberCount: 1234,
    circleCount: 56,
    upcomingEvents: [],
    posts: [],
    postsCurated: false,
  },
}

const puck = (data: Data, metadata: Metadata) =>
  renderToStaticMarkup(<PuckRender config={config} data={data} metadata={metadata} />)
const block = (data: Data, metadata: Metadata) =>
  renderToStaticMarkup(<BlockRender config={config} data={data} metadata={metadata} />)

// The core assertion: exact string parity with Puck. Returns the markup so a
// case can make additional (e.g. metadata-threading) assertions on it.
function expectParity(data: Data, metadata: Metadata = {}): string {
  const mine = block(data, metadata)
  const theirs = puck(data, metadata)
  expect(mine).toBe(theirs)
  return mine
}

describe('BlockRender is byte-identical to Puck rsc <Render>', () => {
  it('root + plain prop-driven blocks (Heading, Text, Statement)', () => {
    const data: Data = {
      root: {},
      content: [
        item('Heading', 'h1', { title: 'Gather your people', titleAccent: 'people' }),
        item('Text', 't1', { body: 'Some **bold** and *italic* copy.' }),
        item('Statement', 's1', { text: 'A bold statement.', accent: 'bold' }),
      ],
    }
    const html = expectParity(data)
    expect(html).toContain('Gather your ') // accent word "people" is wrapped in a span
    expect(html).toContain('bold')
  })

  it('threads metadata through the config root (space layout preset wraps children)', () => {
    const data: Data = {
      root: {},
      content: [item('Heading', 'h1', { title: 'Space page' })],
    }
    // With space metadata the config root wraps children in an airy rhythm div;
    // without it, root passes children straight through. Parity must hold for both,
    // and the two outputs must differ (proving metadata reaches config.root.render).
    const withSpace = expectParity(data, { space: { layoutPreset: 'sections' } })
    const withoutSpace = expectParity(data, {})
    expect(withSpace).not.toBe(withoutSpace)
    expect(withSpace).toContain('space-y-16') // the "sections" preset rhythm
  })

  it('threads metadata into a top-level block (LiveStats reads puck.metadata.live)', () => {
    const data: Data = {
      root: {},
      content: [item('LiveStats', 'ls1')],
    }
    const withLive = expectParity(data, LIVE)
    const withoutLive = expectParity(data, {})
    // The live counts change the rendered markup, so a threading regression would
    // surface as a diff here (and as a parity failure above if only one side broke).
    expect(withLive).not.toBe(withoutLive)
  })

  it('nested slot: Container renders its `content` slot as nested items', () => {
    const data: Data = {
      root: {},
      content: [
        item('Container', 'c1', {
          content: [
            item('Heading', 'ch1', { title: 'Inside a container' }),
            item('Text', 'ct1', { body: 'Nested body.' }),
          ],
        }),
      ],
    }
    const html = expectParity(data)
    expect(html).toContain('Inside a container')
  })

  it('nested slots: Columns renders col1 / col2 / col3 (3-column)', () => {
    const data: Data = {
      root: {},
      content: [
        item('Columns', 'cols1', {
          count: '3',
          col1: [item('Heading', 'a', { title: 'Col one' })],
          col2: [item('Text', 'b', { body: 'Col two' })],
          col3: [item('Statement', 'c', { text: 'Col three' })],
        }),
      ],
    }
    expectParity(data)
  })

  it('nested slots: SpaceLayout main/side, under a space-metadata root', () => {
    const data: Data = {
      root: {},
      content: [
        item('SpaceLayout', 'sl1', {
          layout: 'main-side',
          sideSticky: 'yes',
          main: [item('Heading', 'm1', { title: 'Main region' })],
          side: [item('Text', 's1', { body: 'Side region' })],
        }),
      ],
    }
    expectParity(data, { space: { layoutPreset: 'stack' } })
  })

  it('deep slot recursion + metadata threaded into a slotted LiveStats', () => {
    const data: Data = {
      root: {},
      content: [
        item('Container', 'c1', {
          content: [
            item('Columns', 'cols1', {
              count: '2',
              col1: [item('LiveStats', 'ls-nested')],
              col2: [item('Heading', 'deep', { title: 'Deeply nested heading' })],
            }),
          ],
        }),
      ],
    }
    // Parity with AND without live metadata — proves nested items receive
    // puck.metadata identically to Puck (LiveStats deep inside two slots).
    const withLive = expectParity(data, LIVE)
    const withoutLive = expectParity(data, {})
    expect(withLive).not.toBe(withoutLive)
    expect(withLive).toContain('Deeply nested heading')
  })

  it('skips unknown block types instead of throwing (matches Puck)', () => {
    const data: Data = {
      root: {},
      content: [
        item('Heading', 'h1', { title: 'Real block' }),
        { type: 'ThisBlockDoesNotExist', props: { id: 'x1', whatever: true } } as unknown as Data['content'][number],
        item('Text', 't1', { body: 'Another real block' }),
      ],
    }
    const html = expectParity(data)
    expect(html).toContain('Real block')
    expect(html).toContain('Another real block')
  })

  it('renders an empty document to empty markup (matches Puck)', () => {
    expect(expectParity({ root: {}, content: [] })).toBe('')
  })
})

describe('BlockRender is resilient to malformed input (beyond Puck, which throws)', () => {
  it('renders nothing for a doc missing content/root without throwing', () => {
    // Puck rsc <Render> dereferences data.root directly and would throw here; the
    // in-house renderer defensively defaults, matching the "render nothing" contract.
    expect(block({} as Data, {})).toBe('')
    expect(block({ content: undefined, root: undefined } as unknown as Data, {})).toBe('')
  })
})
