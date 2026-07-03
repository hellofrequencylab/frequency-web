import { describe, it, expect } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import {
  parseSurfaceVisibility,
  isTypeHiddenOnSurface,
  filterDocForSurface,
} from './surface-visibility'

// The per-surface visibility model (ADR-508 U4-B) is PURE, so it is locked here without a browser. The
// contract: parse is fail-safe (a malformed blob hides nothing); the filter drops hidden-type blocks at
// the TOP LEVEL and inside SpaceLayout main / side slots, returns a NEW doc, and never mutates; an
// unknown surface hides nothing; the default (no hidden types) is an equivalent doc.

const doc = (content: unknown[]): Data => ({ root: {}, content: content as Data['content'] })

describe('parseSurfaceVisibility', () => {
  it('reads hiddenTypes per known surface, keeping only string entries', () => {
    const parsed = parseSurfaceVisibility({
      surfaceVisibility: {
        website: { hiddenTypes: ['SpaceOfferings', 'SpaceStats', 42, '', 'SpaceOfferings'] },
        space: { hiddenTypes: ['SpaceTeam'] },
      },
    })
    // Non-strings dropped, blanks dropped, de-duplicated, order preserved.
    expect(parsed.website.hiddenTypes).toEqual(['SpaceOfferings', 'SpaceStats'])
    expect(parsed.space.hiddenTypes).toEqual(['SpaceTeam'])
    expect(parsed.spotlight.hiddenTypes).toEqual([])
  })

  it('fails safe to all-empty on a malformed or absent blob', () => {
    for (const bad of [null, undefined, 'nope', 7, [], { surfaceVisibility: [] }, { surfaceVisibility: 'x' }]) {
      const parsed = parseSurfaceVisibility(bad)
      expect(parsed.website.hiddenTypes).toEqual([])
      expect(parsed.space.hiddenTypes).toEqual([])
      expect(parsed.spotlight.hiddenTypes).toEqual([])
    }
  })

  it('ignores an unknown surface key', () => {
    const parsed = parseSurfaceVisibility({ surfaceVisibility: { mystery: { hiddenTypes: ['X'] } } })
    expect(parsed.website.hiddenTypes).toEqual([])
    expect(parsed.space.hiddenTypes).toEqual([])
    expect(parsed.spotlight.hiddenTypes).toEqual([])
  })
})

describe('isTypeHiddenOnSurface', () => {
  const prefs = { surfaceVisibility: { website: { hiddenTypes: ['SpaceOfferings'] } } }

  it('reports a hidden type on its surface, and not on another', () => {
    expect(isTypeHiddenOnSurface('SpaceOfferings', 'website', prefs)).toBe(true)
    expect(isTypeHiddenOnSurface('SpaceOfferings', 'space', prefs)).toBe(false)
    expect(isTypeHiddenOnSurface('SpaceStats', 'website', prefs)).toBe(false)
  })

  it('fails safe to false on a malformed blob', () => {
    expect(isTypeHiddenOnSurface('SpaceOfferings', 'website', null)).toBe(false)
  })
})

describe('filterDocForSurface', () => {
  it('shows everything by default (no hidden types), returning an equivalent doc', () => {
    const input = doc([{ type: 'SpaceHero', props: { id: 'a' } }, { type: 'SpaceOfferings', props: { id: 'b' } }])
    const out = filterDocForSurface(input, 'website', {})
    expect(out.content.map((b) => b.type)).toEqual(['SpaceHero', 'SpaceOfferings'])
    // A NEW doc (not the same reference), input untouched.
    expect(out).not.toBe(input)
    expect(input.content).toHaveLength(2)
  })

  it('drops a hidden type at the top level', () => {
    const prefs = { surfaceVisibility: { website: { hiddenTypes: ['SpaceOfferings'] } } }
    const out = filterDocForSurface(
      doc([{ type: 'SpaceHero', props: { id: 'a' } }, { type: 'SpaceOfferings', props: { id: 'b' } }]),
      'website',
      prefs,
    )
    expect(out.content.map((b) => b.type)).toEqual(['SpaceHero'])
  })

  it('drops a hidden type inside a SpaceLayout main / side slot', () => {
    const prefs = { surfaceVisibility: { website: { hiddenTypes: ['SpaceOfferings'] } } }
    const out = filterDocForSurface(
      doc([
        {
          type: 'SpaceLayout',
          props: {
            id: 'lay',
            main: [
              { type: 'SpaceAbout', props: { id: 'm1' } },
              { type: 'SpaceOfferings', props: { id: 'm2' } },
            ],
            side: [{ type: 'SpaceOfferings', props: { id: 's1' } }],
          },
        },
      ]),
      'website',
      prefs,
    )
    const layout = out.content[0]
    expect((layout.props.main as { type: string }[]).map((b) => b.type)).toEqual(['SpaceAbout'])
    expect(layout.props.side).toEqual([])
  })

  it('hides nothing for an unknown surface', () => {
    const prefs = { surfaceVisibility: { website: { hiddenTypes: ['SpaceOfferings'] } } }
    const out = filterDocForSurface(
      doc([{ type: 'SpaceOfferings', props: { id: 'b' } }]),
      'mystery' as never,
      prefs,
    )
    expect(out.content.map((b) => b.type)).toEqual(['SpaceOfferings'])
  })

  it('tolerates a non-array content and a non-array slot', () => {
    const prefs = { surfaceVisibility: { website: { hiddenTypes: ['SpaceOfferings'] } } }
    // Non-array content passes through.
    const weird = { root: {}, content: 'nope' } as unknown as Data
    expect(filterDocForSurface(weird, 'website', prefs).content).toBe('nope' as unknown)
    // A SpaceLayout with a non-array slot passes the slot through untouched.
    const out = filterDocForSurface(
      doc([{ type: 'SpaceLayout', props: { id: 'lay', main: 'oops', side: null } }]),
      'website',
      prefs,
    )
    expect(out.content[0].props.main).toBe('oops')
    expect(out.content[0].props.side).toBeNull()
  })
})
