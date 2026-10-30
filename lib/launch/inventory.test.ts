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
  it('flows a skipped photo into the item, keeps it on the list, and never marks an existing photo skipped', () => {
    const by = (cover: string | null) => Object.fromEntries(inventorySections({ rows, spaceName: 'A', coverImageUrl: cover, logoUrl: null, skippedPhotos: ['sc-cover', 'sc-logo'] }).flatMap((x) => x.items).map((i) => [i.id, i]))
    expect(by(null)['sc-cover']).toMatchObject({ state: 'todo', skipped: true })
    expect(by('x')['sc-cover']).toMatchObject({ state: 'done', skipped: false })
    expect(by(null)['sc-logo'].skipped).toBe(true)
  })
})

describe('the Setup list after Publish (LIVE-1916)', () => {
  const base = { rows: { ...rows, extras: { bookingTimes: 0, membershipTiers: 1, donationAsks: 0, products: 0, campaigns: 0, campaignsSent: 0, captureLinks: 0, automations: 0, offerPages: 0 } }, spaceName: 'A', coverImageUrl: null, logoUrl: null }
  it('adds the Money and Reach sections only when asked', () => {
    expect(inventorySections(base).map((s) => s.id)).not.toContain('money')
    const ext = inventorySections({ ...base, extended: true, hrefs: { 'space.memberships': '/spaces/a/settings/offerings#members' } })
    expect(ext.map((s) => s.id).slice(-2)).toEqual(['money', 'reach'])
    expect(ext.flatMap((s) => s.items).find((i) => i.id === 'm-tier')).toMatchObject({ state: 'done', href: '/spaces/a/settings/offerings#members' })
  })
  it('adds nothing when the counts were not read', () => {
    expect(inventorySections({ ...base, rows: { ...rows }, extended: true }).map((s) => s.id)).not.toContain('money')
  })
})
