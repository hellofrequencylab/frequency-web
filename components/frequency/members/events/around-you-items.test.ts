import { describe, expect, it } from 'vitest'
import { planAroundYou, type AyItem } from './around-you-items'

const NOW = Date.parse('2026-10-16T17:00:00Z')
const H = 60 * 60 * 1000

function item(id: string, over: Partial<AyItem> = {}): AyItem {
  return {
    id,
    slug: id,
    title: id,
    when: 'Today at 9am',
    day: 'Today',
    time: '9am',
    startMs: NOW + 2 * H,
    endMs: NOW + 4 * H,
    daysOut: 0,
    dow: 5,
    category: null,
    categoryLabel: null,
    going: false,
    goingCount: 0,
    spotsLeft: null,
    miles: null,
    place: null,
    price: null,
    cover: null,
    coverFocus: null,
    featured: false,
    online: false,
    ...over,
  }
}

describe('planAroundYou (SCAN-975)', () => {
  it('leads with the member’s own next event inside a week, then balances one more of theirs with picks', () => {
    const items = [
      item('mine-1', { going: true }),
      item('a'),
      item('mine-2', { going: true, daysOut: 2 }),
      item('b'),
      item('c'),
    ]
    const plan = planAroundYou(items, ['b', 'mine-1', 'c'], { now: NOW, hasHome: false })
    expect(plan.spotlight).toEqual({ item: items[0], reason: 'next' })
    expect(plan.supporting.map((s) => [s.item.id, s.tag])).toEqual([
      ['mine-2', 'Going'],
      ['b', 'For you'],
      ['c', 'For you'],
    ])
    expect(plan.defaultTab).toBe('yours')
    expect(plan.goingWeek).toBe(2)
    expect(plan.picks).toBe(2)
  })

  it('leads with the best pick when the member has nothing this week, and never repeats an event', () => {
    const items = [item('a'), item('b', { spotsLeft: 2 }), item('later', { going: true, daysOut: 20 })]
    const plan = planAroundYou(items, ['a'], { now: NOW, hasHome: false })
    expect(plan.spotlight?.reason).toBe('pick')
    expect(plan.spotlight?.item.id).toBe('a')
    const ids = plan.supporting.map((s) => s.item.id)
    expect(ids).toEqual(['later', 'b'])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('works signed out: featured first, then the soonest, and drops empty tabs', () => {
    const items = [item('soon'), item('feat', { featured: true, daysOut: 3 })]
    const plan = planAroundYou(items, [], { now: NOW, hasHome: false })
    expect(plan.spotlight?.reason).toBe('featured')
    expect(plan.tabs.map((t) => t.key)).toEqual(['week'])
  })

  it('skips what has already ended and sorts Nearby by distance only with a home base', () => {
    const items = [
      item('over', { startMs: NOW - 5 * H, endMs: NOW - 3 * H }),
      item('far', { miles: 9 }),
      item('close', { miles: 1.2 }),
    ]
    const withHome = planAroundYou(items, [], { now: NOW, hasHome: true })
    expect(withHome.spotlight?.item.id).toBe('far')
    expect(withHome.tabs.find((t) => t.key === 'near')?.items.map((i) => i.id)).toEqual(['close', 'far'])
    expect(planAroundYou(items, [], { now: NOW, hasHome: false }).tabs.some((t) => t.key === 'near')).toBe(false)
  })

  it('has nothing to feature when nothing is coming up', () => {
    expect(planAroundYou([], [], { now: NOW, hasHome: false }).spotlight).toBeNull()
  })
})
