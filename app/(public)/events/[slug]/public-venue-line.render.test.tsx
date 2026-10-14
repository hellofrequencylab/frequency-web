import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PublicEvent } from '@/lib/discover'
import type { PublicEventVenue } from '@/lib/events/public-venue'

// ADR-1744 (owner ruling 2026-10-14, "Show venue & city"): the PUBLIC event page shows the venue
// name and street plus the city when the host left the address visible, and the city alone when
// the host hid it (or the flag is unset/unread). The page and its JSON-LD read the same
// server-side venue (lib/events/public-venue.ts), so they agree. This renders the real page.

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/events/craft-night',
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

let venue: PublicEventVenue = { hide_address: null, venue: null }

vi.mock('@/lib/discover', () => ({
  getPublicEventBySlug: async () => event,
  getPublicEvents: async () => [],
  formatEventDateTime: () => 'Sat, Nov 1 at 6:30 PM',
  hasEventEnded: () => false,
}))
vi.mock('@/app/discover/events/_data', () => ({ getEventEnrichment: async () => null }))
vi.mock('@/lib/events/public-venue', () => ({ getPublicEventVenue: async () => venue }))
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

const loft = { name: 'The Loft', street: '3598 Royal Rd', postal_code: '92084', lat: null, lng: null }

describe('the public event page where-line', () => {
  beforeEach(() => {
    venue = { hide_address: null, venue: null }
  })

  it('shows the venue, street and city with a directions link when the address is visible', async () => {
    venue = { hide_address: false, venue: loft }
    const html = await render()
    expect(html).toContain('The Loft · 3598 Royal Rd, Vista')
    expect(html).toContain('Get directions')
    expect(html).toContain('https://maps.google.com/?q=The%20Loft%2C%203598%20Royal%20Rd%2C%20Vista%2C%2092084')
    // The "shared with members who RSVP" note would be untrue now.
    expect(html).not.toContain('The exact venue is shared with members who RSVP')
  })

  it('shows the city only, and no street anywhere in the HTML, when the host hid the address', async () => {
    // The venue read already drops the columns for a hidden address; feed them anyway to prove the
    // page checks the flag a second time rather than trusting its input.
    venue = { hide_address: true, venue: loft }
    const html = await render()
    expect(html).toContain('Vista')
    expect(html).not.toContain('3598 Royal Rd')
    expect(html).not.toContain('The Loft')
    expect(html).not.toContain('Get directions')
    expect(html).toContain('The exact venue is shared with members who RSVP')
  })

  it('treats an unset or unread flag as hidden', async () => {
    venue = { hide_address: null, venue: loft }
    const html = await render()
    expect(html).not.toContain('3598 Royal Rd')
    expect(html).not.toContain('Get directions')
  })
})
