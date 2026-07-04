import { describe, it, expect } from 'vitest'
import { Circle } from 'lucide-react'
import { mergeAppOverrides, effectiveMinRole, scopeKeyFor, type AppOverrides } from './overrides'
import type { App } from './types'

// docs/ADMIN-RAIL.md Phase 6. mergeAppOverrides + effectiveMinRole are PURE, so the merge contract
// is proven without Supabase/React: identity when there are no overrides, disabled Apps drop,
// `position` reorders (stable), and overrides for ids not in the list are inert. loadAppOverrides
// (the service-role, fail-safe reader) is exercised via the resolver path, not unit-tested here.

// Minimal editor-App fixtures — only the fields mergeAppOverrides reads (id) plus the shape.
function app(id: string): App {
  return {
    id,
    label: id,
    category: 'basics',
    scopes: [{ on: 'scopeKind', kind: 'circle' }],
    gate: { system: 'none' },
    surfaces: { editor: { surface: 'sidebar', Icon: Circle, order: 0, render: 'inline' } },
    themeable: false,
    status: 'final',
    version: 1,
  }
}

const A = app('a')
const B = app('b')
const C = app('c')
const CATALOG = [A, B, C]
const ids = (apps: App[]) => apps.map((x) => x.id)

describe('mergeAppOverrides (pure)', () => {
  it('is identity (order preserved) when there are no overrides', () => {
    expect(ids(mergeAppOverrides(CATALOG, {}))).toEqual(['a', 'b', 'c'])
  })

  it('drops an App whose override is disabled, keeping the rest in catalog order', () => {
    const overrides: AppOverrides = { b: { enabled: false, position: null, minRole: null } }
    expect(ids(mergeAppOverrides(CATALOG, overrides))).toEqual(['a', 'c'])
  })

  it('keeps an App that is explicitly enabled (enabled true is the default)', () => {
    const overrides: AppOverrides = { a: { enabled: true, position: null, minRole: null } }
    expect(ids(mergeAppOverrides(CATALOG, overrides))).toEqual(['a', 'b', 'c'])
  })

  it('reorders by `position`, falling back to catalog index for un-positioned Apps', () => {
    // Pin c to the front (position 0). a/b have no position, so they keep catalog indices 0/1 —
    // ties with c's 0 resolve stably by original order (c arrived after a, so a stays first? no:
    // c's effective position 0 == a's index 0 → tie broken by original index, a before c).
    const overrides: AppOverrides = { c: { enabled: true, position: -1, minRole: null } }
    expect(ids(mergeAppOverrides(CATALOG, overrides))).toEqual(['c', 'a', 'b'])
  })

  it('reorders a middle App above another via position', () => {
    const overrides: AppOverrides = {
      a: { enabled: true, position: 2, minRole: null },
      c: { enabled: true, position: 0, minRole: null },
    }
    // effective positions: a=2, b=1 (index), c=0 → c, b, a
    expect(ids(mergeAppOverrides(CATALOG, overrides))).toEqual(['c', 'b', 'a'])
  })

  it('ignores overrides whose id is not in the list (inert)', () => {
    const overrides: AppOverrides = {
      unknown: { enabled: false, position: 0, minRole: 'guide' },
    }
    expect(ids(mergeAppOverrides(CATALOG, overrides))).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input array', () => {
    const input = [...CATALOG]
    mergeAppOverrides(input, { c: { enabled: true, position: -5, minRole: null } })
    expect(ids(input)).toEqual(['a', 'b', 'c'])
  })
})

describe('effectiveMinRole (pure)', () => {
  it('returns the per-App role floor when set', () => {
    const overrides: AppOverrides = { a: { enabled: true, position: null, minRole: 'guide' } }
    expect(effectiveMinRole('a', overrides)).toBe('guide')
  })

  it('returns null when the App has no override or no floor', () => {
    const overrides: AppOverrides = { a: { enabled: false, position: null, minRole: null } }
    expect(effectiveMinRole('a', overrides)).toBeNull()
    expect(effectiveMinRole('missing', overrides)).toBeNull()
  })
})

describe('scopeKeyFor', () => {
  it('is the scope kind', () => {
    expect(scopeKeyFor({ kind: 'global' })).toBe('global')
    expect(scopeKeyFor({ kind: 'circle', id: 'abc' })).toBe('circle')
  })
})
