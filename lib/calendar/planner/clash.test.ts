import { describe, expect, it } from 'vitest'
import { findClashes, overlapsUnavailable } from './clash'
import type { PlannerItem } from './types'

const it_ = (o: Partial<PlannerItem> & { id: string }): PlannerItem => ({
  title: o.id,
  kind: 'pencil',
  date: '2026-10-27',
  startMin: 18 * 60,
  durMin: 60,
  ...o,
})
const repairs = it_({ id: 'repairs', kind: 'unavailable', date: '2026-10-26', end: '2026-10-28', startMin: null })

describe('findClashes', () => {
  it('flags a timed item inside a multi-day closure', () => {
    expect([...findClashes([it_({ id: 'stretch' }), repairs])]).toEqual(['stretch'])
  })
  it('flags the first and last day of the closure', () => {
    const out = findClashes([it_({ id: 'a', date: '2026-10-26' }), it_({ id: 'b', date: '2026-10-28' }), it_({ id: 'c', date: '2026-10-29' }), repairs])
    expect([...out].sort()).toEqual(['a', 'b'])
  })
  it('flags a multi-day item that runs into the block', () => {
    expect(findClashes([it_({ id: 'trip', date: '2026-10-24', end: '2026-10-26', startMin: null }), repairs]).has('trip')).toBe(true)
  })
  it('never flags unavailable or cancelled items', () => {
    const out = findClashes([repairs, it_({ id: 'x', kind: 'cancelled' }), it_({ id: 'other', kind: 'unavailable', date: '2026-10-27' })])
    expect(out.size).toBe(0)
  })
  it('flags every other kind, including a private meeting and a to-do block', () => {
    const out = findClashes([it_({ id: 'p', kind: 'private' }), it_({ id: 't', kind: 'todo' }), it_({ id: 'e', kind: 'event' }), repairs])
    expect([...out].sort()).toEqual(['e', 'p', 't'])
  })
  it('does not flag when nothing is unavailable', () => {
    expect(findClashes([it_({ id: 'a' })]).size).toBe(0)
  })
})

describe('timed against timed on one day', () => {
  const block = it_({ id: 'b', kind: 'unavailable', startMin: 14 * 60, durMin: 120 })
  it('needs the times to overlap', () => {
    expect(overlapsUnavailable(it_({ id: 'morning', startMin: 9 * 60 }), block)).toBe(false)
    expect(overlapsUnavailable(it_({ id: 'inside', startMin: 15 * 60 }), block)).toBe(true)
    expect(overlapsUnavailable(it_({ id: 'touching', startMin: 16 * 60 }), block)).toBe(false)
    expect(overlapsUnavailable(it_({ id: 'straddle', startMin: 13 * 60 + 30 }), block)).toBe(true)
  })
  it('treats an all-day item as clashing on the date alone', () => {
    expect(overlapsUnavailable(it_({ id: 'all', startMin: null }), block)).toBe(true)
  })
})
