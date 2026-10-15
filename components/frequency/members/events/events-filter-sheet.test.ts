import { describe, expect, it } from 'vitest'
import { stagedCount } from './events-filter-sheet'

const counts = {
  category: { '': 40, social: 7, learning: 3 },
  date: { '': 40, today: 2, week: 9 },
}
const initial = { category: '', date: '', sort: '' }

describe('stagedCount (the filter sheet Apply label)', () => {
  it('is the current total when nothing changed', () => {
    expect(stagedCount(initial, { ...initial }, counts, 40)).toBe(40)
  })
  it('ignores a sort change, which only reorders', () => {
    expect(stagedCount(initial, { ...initial, sort: 'popularity' }, counts, 40)).toBe(40)
  })
  it('is the option count when exactly one facet changed', () => {
    expect(stagedCount(initial, { ...initial, category: 'social' }, counts, 40)).toBe(7)
    expect(stagedCount({ ...initial, date: 'week' }, { ...initial }, counts, 9)).toBe(40)
  })
  it('does not guess when two facets changed or a count is missing', () => {
    expect(stagedCount(initial, { ...initial, category: 'social', date: 'today' }, counts, 40)).toBeNull()
    expect(stagedCount(initial, { ...initial, price: 'free' }, counts, 40)).toBeNull()
  })
})
