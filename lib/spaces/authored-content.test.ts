import { describe, it, expect } from 'vitest'
import { resolveSpaceAuthoredContent } from './authored-content'

// Pure keying tests for the space authored-content adapter (no React / IO). Locks the extraction the
// space content-block renderers rely on: Puck type -> unified content id mapping, per-type grouping in
// document order, hidden-block skipping, DATA-block exclusion, and the fail-safe empty bag.

function prefsWith(content: unknown[]): Record<string, unknown> {
  return { pageDocs: { home: { root: {}, content } } }
}

describe('resolveSpaceAuthoredContent', () => {
  it('groups authored content blocks by unified id in document order', () => {
    const bag = resolveSpaceAuthoredContent(
      prefsWith([
        { type: 'Heading', props: { id: 'h1', title: 'One' } },
        { type: 'Text', props: { id: 't1', body: 'para' } },
        { type: 'Heading', props: { id: 'h2', title: 'Two' } },
        { type: 'Image', props: { id: 'i1', image: 'a.png' } },
      ]),
      'Studio',
    )
    expect(bag.heading.map((b) => b.props.id)).toEqual(['h1', 'h2'])
    expect(bag.text).toHaveLength(1)
    expect(bag.image).toHaveLength(1)
    expect(bag.gallery).toEqual([])
  })

  it('maps the Spotlight content family and Statement onto the same content ids', () => {
    const bag = resolveSpaceAuthoredContent(
      prefsWith([
        { type: 'Statement', props: { id: 's1', text: 'bold' } },
        { type: 'SpotlightQuote', props: { id: 'q1', text: 'quote' } },
        { type: 'SpotlightEmbed', props: { id: 'e1' } },
        { type: 'Divider', props: { id: 'd1' } },
      ]),
      'Studio',
    )
    expect(bag.text).toHaveLength(1)
    expect(bag.quote).toHaveLength(1)
    expect(bag.embed).toHaveLength(1)
    expect(bag.divider).toHaveLength(1)
  })

  it('skips hidden blocks and drops Space DATA blocks (known, but not authored content)', () => {
    // Every block here is a known config type (so the doc passes the renderability guard); the adapter
    // then keeps only the visible content-authoring blocks.
    const bag = resolveSpaceAuthoredContent(
      prefsWith([
        { type: 'Heading', props: { id: 'h1', title: 'Shown' } },
        { type: 'Heading', props: { id: 'h2', title: 'Parked' }, hidden: true },
        { type: 'SpaceEvents', props: { id: 'ev' } },
        { type: 'SpaceAbout', props: { id: 'ab' } },
      ]),
      'Studio',
    )
    expect(bag.heading.map((b) => b.props.id)).toEqual(['h1'])
    // The Space DATA sections never enter any content slice (they are rendered by the module data blocks).
    expect(Object.values(bag).flat()).toHaveLength(1)
  })

  it('fails safe to an all-empty bag on missing / malformed preferences', () => {
    const empty = { heading: [], text: [], image: [], gallery: [], quote: [], embed: [], divider: [] }
    // No doc at all -> the universal default doc (only Space DATA blocks) -> nothing authored.
    expect(resolveSpaceAuthoredContent(null, 'Studio')).toEqual(empty)
    expect(resolveSpaceAuthoredContent({ pageDocs: { home: 'garbage' } }, 'Studio')).toEqual(empty)
    expect(resolveSpaceAuthoredContent({ pageDocs: { home: { root: {}, content: 'nope' } } }, 'Studio')).toEqual(empty)
  })
})
