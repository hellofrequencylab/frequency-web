import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PublicEvent } from '@/lib/discover'
import type { PublicJoinDoor } from '@/lib/events/public-join-door'

// The owner's 2026-10-14 ask: a stranger on a shared event link can RSVP or buy before they have an
// account. The public page used to offer only "Find your Circle". This renders the real page.

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/events/craft-night',
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}))

const event: PublicEvent = {
  id: 'evt-1',
  slug: 'craft-night',
  title: 'Craft Night',
  description: 'Bring a project.',
  starts_at: '2099-11-01T18:30:00Z',
  ends_at: null,
  city: 'Vista',
  circle_id: null,
  circle_name: null,
  price_cents: null,
}

let door: PublicJoinDoor | null = null

vi.mock('@/lib/discover', () => ({
  getPublicEventBySlug: async () => event,
  getPublicEvents: async () => [],
  formatEventDateTime: () => 'Sat, Nov 1 at 6:30 PM',
  hasEventEnded: () => false,
}))
vi.mock('@/app/discover/events/_data', () => ({ getEventEnrichment: async () => null, EVENT_CATEGORIES: [] }))
vi.mock('@/lib/events/public-venue', () => ({ getPublicEventVenue: async () => ({ hide_address: null, venue: null }) }))
vi.mock('@/lib/events/public-join-door', () => ({
  loadPublicJoinDoor: async () => (door ? { door, going: 3 } : null),
}))
vi.mock('@/lib/events/series-seo', () => ({
  seriesRobots: () => undefined,
  seriesSeoFactsBySlug: async () => null,
  suppressPastNoindex: () => false,
}))
vi.mock('@/lib/events/series-config', () => ({
  getSeriesDisplayConfig: async () => ({ indexedOccurrences: 0 }),
}))

async function render(): Promise<string> {
  const { default: PublicEventPage } = await import('./page')
  const node = await PublicEventPage({ params: Promise.resolve({ slug: 'craft-night' }) })
  return renderToStaticMarkup(node)
}

describe('the public event page join door', () => {
  it('offers the guest RSVP on a free event, with a log in line for members', async () => {
    door = { kind: 'rsvp', isFull: false }
    const html = await render()
    expect(html).toContain('data-public-join-door="rsvp"')
    expect(html).toContain('Save your seat')
    expect(html).toContain('/sign-in?next=/events/craft-night')
  })

  it('offers the guest ticket form on a ticketed event', async () => {
    door = { kind: 'tickets', priceLabel: '$15.00' }
    const html = await render()
    expect(html).toContain('data-public-join-door="tickets"')
    expect(html).toContain('Get your ticket')
  })

  it('keeps the plain sign-up card when the door could not be read', async () => {
    door = null
    const html = await render()
    expect(html).not.toContain('data-public-join-door')
    expect(html).toContain('Want to be at Craft Night?')
  })
})
