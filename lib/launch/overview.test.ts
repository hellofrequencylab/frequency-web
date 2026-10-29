import { describe, expect, it } from 'vitest'
import { overviewProgress, type InventorySection } from './overview'

const sections: InventorySection[] = [
  { id: 'spotlight', title: 'Spotlight', items: [{ id: 'live', label: 'Published', state: 'done', found: 'Daniel Tyack' }] },
  {
    id: 'space',
    title: 'Your Space',
    items: [
      { id: 'tagline', label: 'Tagline', state: 'done', found: 'Emotional Alchemy' },
      { id: 'cover', label: 'Cover photo', state: 'todo', photo: true, skipped: true },
      { id: 'hours', label: 'Hours', state: 'todo' },
    ],
  },
  { id: 'website', title: 'Website', items: [{ id: 'site', label: 'Published', state: 'todo' }] },
]

describe('the launch overview', () => {
  it('counts what is done per section and overall', () => {
    const p = overviewProgress(sections)
    expect(p.done).toBe(2)
    expect(p.total).toBe(5)
    expect(p.ratio).toBeCloseTo(0.4)
    expect(p.sections.map((s) => [s.id, s.done, s.total])).toEqual([['spotlight', 1, 1], ['space', 1, 3], ['website', 0, 1]])
  })
  it('marks the first unfinished section as next and the rest as later', () => {
    expect(overviewProgress(sections).sections.map((s) => s.state)).toEqual(['done', 'next', 'later'])
  })
  it('asks for the next item that was not skipped, and falls back to a skipped one', () => {
    expect(overviewProgress(sections).next?.item.id).toBe('hours')
    const onlySkipped: InventorySection[] = [{ id: 'space', title: 'Your Space', items: [{ id: 'cover', label: 'Cover photo', state: 'todo', photo: true, skipped: true }] }]
    expect(overviewProgress(onlySkipped).next?.item.id).toBe('cover')
  })
  it('has no next item and a full ratio when everything is done', () => {
    const all: InventorySection[] = [{ id: 'spotlight', title: 'Spotlight', items: [{ id: 'live', label: 'Published', state: 'done' }] }]
    const p = overviewProgress(all)
    expect(p.next).toBeNull()
    expect(p.ratio).toBe(1)
  })
})
