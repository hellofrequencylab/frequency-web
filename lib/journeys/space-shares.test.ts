import { describe, it, expect } from 'vitest'
import { coHostSpacesFromRows, mergeOwnedAndSharedPlans } from './space-shares'

describe('mergeOwnedAndSharedPlans', () => {
  const p = (id: string, created_at: string) => ({ id, created_at })

  it('merges newest first and caps at the limit', () => {
    const out = mergeOwnedAndSharedPlans([p('a', '2026-03-01'), p('b', '2026-01-01')], [p('s', '2026-02-01')], 2)
    expect(out.map((r) => r.id)).toEqual(['a', 's'])
  })

  it('keeps one row per id', () => {
    const out = mergeOwnedAndSharedPlans([p('a', '2026-03-01')], [p('a', '2026-03-01')], 10)
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('returns the own rows untouched when nothing is shared', () => {
    const own = [p('b', '2026-01-01'), p('a', '2026-03-01')]
    expect(mergeOwnedAndSharedPlans(own, [], 10)).toEqual(own)
  })
})

describe('coHostSpacesFromRows', () => {
  const space = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    slug: `s-${id}`,
    name: `Name ${id}`,
    brand_name: null,
    status: 'active',
    visibility: 'network',
    ...extra,
  })

  it('credits accepted shares only, in share order', () => {
    const out = coHostSpacesFromRows(
      [
        { space_id: 'x', status: 'pending' },
        { space_id: 'b', status: 'accepted' },
        { space_id: 'a', status: 'accepted' },
        { space_id: 'y', status: 'revoked' },
      ],
      [space('a'), space('b'), space('x'), space('y')],
      'home',
    )
    expect(out.map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('drops inactive, private, missing and home Spaces, and prefers the brand name', () => {
    const out = coHostSpacesFromRows(
      [
        { space_id: 'off', status: 'accepted' },
        { space_id: 'hidden', status: 'accepted' },
        { space_id: 'gone', status: 'accepted' },
        { space_id: 'home', status: 'accepted' },
        { space_id: 'ok', status: 'accepted' },
        { space_id: 'ok', status: 'accepted' },
      ],
      [
        space('off', { status: 'suspended' }),
        space('hidden', { visibility: 'private' }),
        space('home'),
        space('ok', { brand_name: 'Daniel Tyack' }),
      ],
      'home',
    )
    expect(out).toEqual([{ id: 'ok', slug: 's-ok', name: 'Daniel Tyack' }])
  })
})
