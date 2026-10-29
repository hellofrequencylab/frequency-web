import { describe, expect, it } from 'vitest'
import { getStartedView, isPublished } from './get-started'
import { inventorySections } from './inventory'
import { overviewProgress } from './overview'

const rows = { preferences: { spotlight: { published: true } }, tagline: 'Emotional Alchemy', about: 'My story', eventCount: 0, circleCount: 0, journeyCount: 0, contactCount: 0, payoutsReady: false }
const facts = { rows, spaceName: 'Daniel Tyack', coverImageUrl: null, logoUrl: null }

describe('getStartedView', () => {
  it('hands the list over only once the Spotlight is published', () => {
    expect(isPublished(inventorySections(facts))).toBe(true)
    expect(isPublished(inventorySections({ ...facts, rows: { ...rows, preferences: {} } }))).toBe(false)
  })
  it('counts exactly what the launch overview counts', () => {
    const s = inventorySections(facts)
    const p = overviewProgress(s)
    const v = getStartedView(s)
    expect([v.done, v.total, v.ratio]).toEqual([p.done, p.total, p.ratio])
    expect(v.sections.map((x) => x.id)).toEqual(['spotlight', 'space', 'website', 'email', 'schedule', 'circle', 'journey', 'paid'])
  })
  it('keeps the record value beside what is done and a way in for what is not', () => {
    const v = getStartedView(inventorySections(facts))
    expect(v.found.find((i) => i.id === 'sc-tag')?.found).toBe('"Emotional Alchemy"')
    expect(v.todo.find((i) => i.id === 'c-first')?.href).toBe('/launch/step/event')
    expect(v.todo.find((i) => i.id === 'p-ready')?.href).toBe('/launch/step/get-paid')
    expect(v.todo.find((i) => i.id === 'sc-logo')?.photo).toBe(true)
  })
  it('ticks Circle, Journey and Get paid from real rows and reads complete when all is done', () => {
    const v = getStartedView(
      inventorySections({
        rows: { ...rows, eventCount: 1, circleCount: 2, journeyCount: 1, contactCount: 9, payoutsReady: true, preferences: { spotlight: { published: true }, websitePublished: true } },
        spaceName: 'Daniel Tyack',
        coverImageUrl: 'a',
        logoUrl: 'b',
      }),
    )
    expect(v.found.find((i) => i.id === 'ci-first')?.found).toBe('2 open')
    expect(v.todo.map((i) => i.id)).toEqual(['sp-words'])
  })
})
