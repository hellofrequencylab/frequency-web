import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isWellFormed, isFullyKnown, unknownTypes } from '@/lib/page-editor/templates'
import {
  isWellFormedSpaceDoc,
  isFullyKnownSpaceDoc,
  unknownSpaceDocTypes,
} from '@/lib/page-editor/templates/space'
import { BlockRender } from '@/lib/page-editor/block-render'
import { config } from '@/lib/page-editor/config'
import type { Data } from '@/lib/page-editor/types'
import { removeBlockDeep, moveBlockTo, duplicateBlockDeep } from '@/components/page-editor/mobile/data-ops'

// ─────────────────────────────────────────────────────────────────────────────
// ADR-978 — a renamed block must not delete the author's work.
//
// These tests pin the three things that make that true, and each one is here
// because its absence was a real defect:
//   1. a document carrying a retired type is KEPT, not discarded (the original bug)
//   2. it still RENDERS on the live page, minus the retired block (without this,
//      publishing succeeds and the public page silently shows the code template)
//   3. the editor placeholder NEVER reaches a visitor (the public-safety invariant)
//
// The five orphan types below are the real ones found in production on 2026-08-10.
// ─────────────────────────────────────────────────────────────────────────────

const ORPHANS = ['ZigZag', 'PageHero', 'ImageBand', 'BetaCTA', 'FeatureGallery'] as const

const mixed: Data = {
  root: {},
  content: [
    { type: 'Heading', props: { id: 'a', title: 'Kept' } },
    { type: 'ZigZag', props: { id: 'b', title: 'Retired', kicker: 'x', tone: 'y' } },
  ],
} as unknown as Data

describe('predicates', () => {
  it('keeps a document that carries a retired type', () => {
    expect(isWellFormed(mixed)).toBe(true)
  })

  it('still reports it as not fully known', () => {
    expect(isFullyKnown(mixed)).toBe(false)
  })

  it('names the unresolvable types', () => {
    expect(unknownTypes(mixed)).toEqual(['ZigZag'])
  })

  it('rejects a genuinely malformed document', () => {
    expect(isWellFormed({ root: {}, content: [{ props: { id: 'a' } }] })).toBe(false)
    expect(isWellFormed({ root: {}, content: [] })).toBe(false)
    expect(isWellFormed(null)).toBe(false)
    expect(isWellFormed({ root: {}, content: 'nope' })).toBe(false)
  })

  it('detects all five real orphan types', () => {
    const doc = { root: {}, content: ORPHANS.map((type, i) => ({ type, props: { id: `n${i}` } })) }
    expect(isWellFormed(doc)).toBe(true)
    expect(unknownTypes(doc).sort()).toEqual([...ORPHANS].sort())
  })

  it('isFullyKnown is exactly the OLD isRenderable, so public routes did not change meaning', () => {
    const known = new Set(Object.keys(config.components))
    const old = (d: unknown) => {
      const c = (d as Data | null)?.content
      if (!Array.isArray(c) || c.length === 0) return false
      return c.every((b) => typeof b?.type === 'string' && known.has(b.type))
    }
    const cases: unknown[] = [
      mixed,
      null,
      undefined,
      42,
      { root: {}, content: [] },
      { root: {}, content: [null] },
      { root: {}, content: [{}] },
      { root: {}, content: [{ type: 42 }] },
      { root: {}, content: [{ type: 'Heading', props: { id: 'a' } }] },
    ]
    for (const c of cases) expect(isFullyKnown(c)).toBe(old(c))
  })
})

describe('the Space twin (the third copy of the predicate — ADR-978)', () => {
  it('keeps a Space doc carrying a retired type', () => {
    expect(isWellFormedSpaceDoc(mixed)).toBe(true)
    expect(isFullyKnownSpaceDoc(mixed)).toBe(false)
    expect(unknownSpaceDocTypes(mixed)).toEqual(['ZigZag'])
  })

  it('still rejects a malformed Space doc', () => {
    expect(isWellFormedSpaceDoc({ root: {}, content: [{ props: {} }] })).toBe(false)
    expect(isWellFormedSpaceDoc(null)).toBe(false)
  })
})

describe('rendering', () => {
  it('renders the KNOWN siblings on the live page and drops only the retired block', () => {
    const html = renderToStaticMarkup(<BlockRender config={config} data={mixed} />)
    expect(html).toContain('Kept')
    expect(html).not.toContain('ZigZag')
  })

  it('NEVER shows the editor placeholder to a visitor', () => {
    const html = renderToStaticMarkup(<BlockRender config={config} data={mixed} />)
    expect(html).not.toContain('not available in this version')
  })

  it('shows a labelled placeholder while editing', () => {
    const html = renderToStaticMarkup(<BlockRender config={config} data={mixed} isEditing />)
    expect(html).toContain('not available in this version')
    expect(html).toContain('ZigZag')
  })

  it('does not throw when a retired block carries no props at all', () => {
    const noProps = { root: {}, content: [{ type: 'ZigZag' }] } as unknown as Data
    expect(() => renderToStaticMarkup(<BlockRender config={config} data={noProps} isEditing />)).not.toThrow()
    expect(() => renderToStaticMarkup(<BlockRender config={config} data={noProps} />)).not.toThrow()
  })
})

describe('round-trip through the editor ops', () => {
  const doc: Data = {
    root: {},
    content: [
      { type: 'Heading', props: { id: 'a', title: 'One' } },
      { type: 'ZigZag', props: { id: 'b', title: 'Retired', kicker: 'keep-me', tone: 'also-keep' } },
      { type: 'Heading', props: { id: 'c', title: 'Two' } },
    ],
  } as unknown as Data

  const orphanOf = (d: Data) => d.content.find((i) => i.type === 'ZigZag')

  it('survives deleting a DIFFERENT block, with every prop intact', () => {
    const next = removeBlockDeep(doc, config, 'a').data
    expect(orphanOf(next)).toEqual(doc.content[1])
  })

  it('survives a reorder', () => {
    const next = moveBlockTo(doc, config, 'c', { parentId: null, slotKey: null, index: 0 })
    expect(orphanOf(next)).toEqual(doc.content[1])
  })

  it('survives duplicating a different block', () => {
    const next = duplicateBlockDeep(doc, config, 'a').data
    expect(orphanOf(next)).toEqual(doc.content[1])
  })
})
