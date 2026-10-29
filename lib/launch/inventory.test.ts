import { describe, expect, it } from 'vitest'
import { inventorySections } from './inventory'
import { overviewProgress } from './overview'

const rows = { preferences: {}, tagline: null, about: null, eventCount: 0, circleCount: 0, journeyCount: 0, contactCount: 0, payoutsReady: false }

describe('inventorySections', () => {
  it('shows nothing as done for an empty account', () => {
    const p = overviewProgress(inventorySections({ rows, spaceName: '', coverImageUrl: null, logoUrl: null }))
    expect(p.done).toBe(0)
  })
  it('ticks only what a record says, with the record value as found', () => {
    const s = inventorySections({ rows: { ...rows, tagline: 'Emotional Alchemy', about: 'My story', eventCount: 2, contactCount: 5, preferences: { spotlight: { published: true } } }, spaceName: 'Daniel Tyack', coverImageUrl: 'x', logoUrl: null })
    const by = Object.fromEntries(s.flatMap((x) => x.items).map((i) => [i.id, i]))
    expect(by['sp-live'].state).toBe('done')
    expect(by['sc-tag'].found).toBe('"Emotional Alchemy"')
    expect(by['sc-cover'].state).toBe('done')
    expect(by['sc-logo'].state).toBe('todo')
    expect(by['sc-logo'].photo).toBe(true)
    expect(by['c-first'].found).toBe('2 on the calendar')
    expect(by['w-site'].state).toBe('todo')
  })
})
