import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Data, Metadata } from '@/lib/page-editor/types'
import { config } from '@/lib/page-editor/config'
import { BlockRender } from './block-render'

// ─────────────────────────────────────────────────────────────────────────────
// CORRECTNESS GATE — frozen golden-markup snapshots of BlockRender's output.
//
// BlockRender was PROVEN byte-identical to Puck's own `@measured/puck/rsc` <Render>
// (renderToStaticMarkup deep-equal) before the package was removed (ADR-493 Phase 2).
// With Puck gone, the golden comparison is captured as inline snapshots of the CURRENT
// BlockRender output: any future regression in the render path (slot recursion,
// metadata threading, unknown-type skipping, root wrapping) surfaces as a snapshot
// diff. The snapshots therefore stand in for the old Puck-parity assertion.
//
// The docs exercise: the config root wrapper, plain prop-driven blocks, metadata
// threading (top-level AND nested-in-slot, via LiveStats which reads
// puck.metadata.live), nested slots (Container / Columns / SpaceLayout), deep slot
// recursion, unknown-type skipping, and empty/malformed docs.
//
// All blocks chosen render purely from props/metadata (no next/link, next/image,
// router or Supabase context), so the renderer runs cleanly under
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

const block = (data: Data, metadata: Metadata = {}) =>
  renderToStaticMarkup(<BlockRender config={config} data={data} metadata={metadata} />)

describe('BlockRender golden markup (frozen; was byte-identical to Puck rsc <Render>)', () => {
  it('root + plain prop-driven blocks (Heading, Text, Statement)', () => {
    const data: Data = {
      root: {},
      content: [
        item('Heading', 'h1', { title: 'Gather your people', titleAccent: 'people' }),
        item('Text', 't1', { body: 'Some **bold** and *italic* copy.' }),
        item('Statement', 's1', { text: 'A bold statement.', accent: 'bold' }),
      ],
    }
    const html = block(data)
    expect(html).toContain('Gather your ') // accent word "people" is wrapped in a span
    expect(html).toContain('bold')
    expect(html).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="text-sm font-bold uppercase tracking-[0.25em] mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Gather your <span class="text-primary">people</span></h2></div></section><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-lg text-muted leading-relaxed space-y-4"><p>Some <strong class="font-semibold text-text">bold</strong> and <em>italic</em> copy.</p></div></div></section><section class="bg-marketing-canvas px-6 py-14 sm:py-24 "><p class="font-display uppercase max-w-3xl mx-auto text-center text-text text-[clamp(2rem,6.5vw,3.75rem)] leading-[1.1]">A <span class="text-primary">bold</span> statement.</p></section>"`)
  })

  it('threads metadata through the config root (space layout preset wraps children)', () => {
    const data: Data = {
      root: {},
      content: [item('Heading', 'h1', { title: 'Space page' })],
    }
    // With space metadata the config root wraps children in an airy rhythm div;
    // without it, root passes children straight through. The two outputs must differ
    // (proving metadata reaches config.root.render), and the "sections" preset rhythm
    // must appear when present.
    const withSpace = block(data, { space: { layoutPreset: 'sections' } })
    const withoutSpace = block(data, {})
    expect(withSpace).not.toBe(withoutSpace)
    expect(withSpace).toContain('space-y-16') // the "sections" preset rhythm
    expect(withSpace).toMatchInlineSnapshot(`"<div class="space-y-16 py-10 sm:space-y-20 sm:py-14"><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="text-sm font-bold uppercase tracking-[0.25em] mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Space page</h2></div></section></div>"`)
    expect(withoutSpace).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="text-sm font-bold uppercase tracking-[0.25em] mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Space page</h2></div></section>"`)
  })

  it('threads metadata into a top-level block (LiveStats reads puck.metadata.live)', () => {
    const data: Data = {
      root: {},
      content: [item('LiveStats', 'ls1')],
    }
    const withLive = block(data, LIVE)
    const withoutLive = block(data, {})
    // The live counts change the rendered markup, so a threading regression would
    // surface as a snapshot diff here (and as a differing pair below).
    expect(withLive).not.toBe(withoutLive)
    expect(withLive).toMatchInlineSnapshot(`"<section class="bg-surface px-6 py-24 sm:py-28 "><div class="max-w-3xl mx-auto text-center"><p class="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">Not a someday idea</p><h2 class="font-display uppercase text-text text-[clamp(1.875rem,5.5vw,3rem)] mb-12">It’s already happening.</h2><div class="grid grid-cols-3 gap-6 max-w-xl mx-auto"><div><p class="font-display text-6xl sm:text-7xl text-text">1,234</p><p class="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">Members</p></div><div><p class="font-display text-6xl sm:text-7xl text-text">56</p><p class="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">Circles</p></div><div><p class="font-display text-6xl sm:text-7xl text-text">0</p><p class="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">Events soon</p></div></div></div></section>"`)
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
    const html = block(data)
    expect(html).toContain('Inside a container')
    expect(html).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto"><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="text-sm font-bold uppercase tracking-[0.25em] mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Inside a container</h2></div></section><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-lg text-muted leading-relaxed space-y-4"><p>Nested body.</p></div></div></section></div></div></section>"`)
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
    expect(block(data)).toMatchInlineSnapshot(`"<section class="px-6 py-12 sm:py-16 bg-surface "><div class="max-w-5xl mx-auto grid gap-8 md:grid-cols-3 items-start"><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="text-sm font-bold uppercase tracking-[0.25em] mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Col one</h2></div></section></div><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-lg text-muted leading-relaxed space-y-4"><p>Col two</p></div></div></section></div><div><section class="bg-marketing-canvas px-6 py-14 sm:py-24 "><p class="font-display uppercase max-w-3xl mx-auto text-center text-text text-[clamp(2rem,6.5vw,3.75rem)] leading-[1.1]">Col three</p></section></div></div></section>"`)
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
    expect(block(data, { space: { layoutPreset: 'stack' } })).toMatchInlineSnapshot(`"<div class="space-y-12 py-8 sm:space-y-14 sm:py-10"><section class="w-full"><div class="grid gap-10 lg:grid-cols-3 lg:gap-14"><div class="space-y-14 lg:col-span-2"><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="text-sm font-bold uppercase tracking-[0.25em] mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Main region</h2></div></section></div></div><aside class="space-y-6 lg:sticky lg:top-24 lg:self-start"><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-lg text-muted leading-relaxed space-y-4"><p>Side region</p></div></div></section></div></aside></div></section></div>"`)
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
    // Snapshot WITH live metadata, and prove nested items receive puck.metadata
    // identically (LiveStats deep inside two slots) by differing without it.
    const withLive = block(data, LIVE)
    const withoutLive = block(data, {})
    expect(withLive).not.toBe(withoutLive)
    expect(withLive).toContain('Deeply nested heading')
    expect(withLive).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto"><div><section class="px-6 py-12 sm:py-16 bg-surface "><div class="max-w-5xl mx-auto grid gap-8 md:grid-cols-2 items-start"><div><section class="bg-surface px-6 py-24 sm:py-28 "><div class="max-w-3xl mx-auto text-center"><p class="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">Not a someday idea</p><h2 class="font-display uppercase text-text text-[clamp(1.875rem,5.5vw,3rem)] mb-12">It’s already happening.</h2><div class="grid grid-cols-3 gap-6 max-w-xl mx-auto"><div><p class="font-display text-6xl sm:text-7xl text-text">1,234</p><p class="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">Members</p></div><div><p class="font-display text-6xl sm:text-7xl text-text">56</p><p class="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">Circles</p></div><div><p class="font-display text-6xl sm:text-7xl text-text">0</p><p class="text-xs text-subtle mt-3 uppercase tracking-widest font-bold">Events soon</p></div></div></div></section></div><div><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="text-sm font-bold uppercase tracking-[0.25em] mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Deeply nested heading</h2></div></section></div></div></section></div></div></section>"`)
  })

  it('skips unknown block types instead of throwing', () => {
    const data: Data = {
      root: {},
      content: [
        item('Heading', 'h1', { title: 'Real block' }),
        { type: 'ThisBlockDoesNotExist', props: { id: 'x1', whatever: true } } as unknown as Data['content'][number],
        item('Text', 't1', { body: 'Another real block' }),
      ],
    }
    const html = block(data)
    expect(html).toContain('Real block')
    expect(html).toContain('Another real block')
    expect(html).not.toContain('ThisBlockDoesNotExist')
    expect(html).toMatchInlineSnapshot(`"<section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><p data-text-role="eyebrow" class="text-sm font-bold uppercase tracking-[0.25em] mb-4 text-primary-strong">Eyebrow</p><h2 class="font-display uppercase text-balance text-[clamp(1.875rem,5.5vw,3rem)] text-text">Real block</h2></div></section><section class="px-6 py-16 sm:py-20 bg-surface "><div class="max-w-3xl mx-auto "><div class="text-lg text-muted leading-relaxed space-y-4"><p>Another real block</p></div></div></section>"`)
  })

  it('renders an empty document to empty markup', () => {
    expect(block({ root: {}, content: [] })).toBe('')
  })
})

describe('BlockRender is resilient to malformed input (beyond Puck, which threw)', () => {
  it('renders nothing for a doc missing content/root without throwing', () => {
    // Puck rsc <Render> dereferenced data.root directly and would throw here; the
    // in-house renderer defensively defaults, matching the "render nothing" contract.
    expect(block({} as Data, {})).toBe('')
    expect(block({ content: undefined, root: undefined } as unknown as Data, {})).toBe('')
  })
})
