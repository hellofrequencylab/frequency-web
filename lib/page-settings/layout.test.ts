import { describe, it, expect } from 'vitest'
import { parseLayout, orderedModuleIds, resolveModuleIds } from './layout'

const ALL = ['a', 'b', 'c', 'd'] as const

describe('page-settings layout resolver', () => {
  it('parses jsonb safely (bad input → empty config)', () => {
    expect(parseLayout(null)).toEqual({ order: [], hidden: [] })
    expect(parseLayout('nope')).toEqual({ order: [], hidden: [] })
    expect(parseLayout([1, 2])).toEqual({ order: [], hidden: [] })
    expect(parseLayout({ order: ['a', 3, 'b'], hidden: ['c'] })).toEqual({ order: ['a', 'b'], hidden: ['c'] })
  })

  it('honors the saved order, drops unknown ids, appends new modules in registry order', () => {
    expect(orderedModuleIds({ order: ['c', 'a', 'zzz'], hidden: [] }, ALL)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('de-dupes a repeated id in the saved order', () => {
    expect(orderedModuleIds({ order: ['b', 'b', 'a'], hidden: [] }, ALL)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('resolveModuleIds removes the hidden set', () => {
    expect(resolveModuleIds({ order: ['c', 'a'], hidden: ['a', 'd'] }, ALL)).toEqual(['c', 'b'])
  })

  it('default (empty config) = registry order, all visible', () => {
    expect(resolveModuleIds({ order: [], hidden: [] }, ALL)).toEqual(['a', 'b', 'c', 'd'])
  })
})
