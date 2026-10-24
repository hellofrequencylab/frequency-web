import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PublicEvent } from '@/lib/discover'
import { eventHasEnded } from '@/lib/events/end-time'

// Real public page and metadata, with safe synthetic reads and the canonical time conversion.

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
  starts_at: '2026-06-26T18:00:00Z',
  ends_at: '2026-06-26T19:00:00Z',
  city: 'Vista',
  circle_id: null,
  circle_name: null,
  price_cents: null,
}

let zone: string | null = 'America/Los_Angeles'
let cancelled = false
vi.mock('@/lib/theme/design', () => ({ SITE_DESIGN: 'frequency' }))

vi.mock('@/lib/discover', () => ({
  getPublicEventBySlug: async () => event,
  getPublicEvents: async () => [],
  formatEventDateTime: () => 'Sat, Nov 1 at 6:30 PM',
  hasEventEnded: (row: PublicEvent) => eventHasEnded(row),
}))
vi.mock('@/app/discover/events/_data', () => ({ getEventEnrichment: async () => ({ time_zone: zone, is_cancelled: cancelled }), EVENT_CATEGORIES: [] }))
vi.mock('@/lib/events/public-venue', () => ({ getPublicEventVenue: async () => ({ hide_address: null, venue: null }) }))
vi.mock('@/lib/events/public-join-door', () => ({
  loadPublicJoinDoor: async () => null,
}))
vi.mock('@/lib/events/series-seo', async (original) => ({
  ...(await original<typeof import('@/lib/events/series-seo')>()),
  shareEventSeo: async () => ({ facts: { inSeries: false, isAnchor: false, ordinal: null, seriesLive: false }, visibility: 'public', timeZone: zone }),
}))
vi.mock('@/lib/events/series-config', () => ({
  getSeriesDisplayConfig: async () => ({ indexedOccurrences: 0 }),
}))

async function render(): Promise<string> {
  const { default: PublicEventPage } = await import('./page')
  const node = await PublicEventPage({ params: Promise.resolve({ slug: 'craft-night' }) })
  return renderToStaticMarkup(node)
}

describe('public event expiry in the host timezone', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-27T00:00:00Z'))
    zone = 'America/Los_Angeles'
    cancelled = false
  })
  afterEach(() => vi.useRealTimers())

  async function metadata() {
    return (await import('./page')).generateMetadata({ params: Promise.resolve({ slug: event.slug }) })
  }

  it('keeps a Pacific evening indexable and visibly upcoming at 17:00 host time', async () => {
    expect((await metadata()).robots).toBeUndefined()
    expect(await render()).not.toContain('This event has ended')
  })

  it('marks the same event ended only after its true 19:00 host cutoff', async () => {
    vi.setSystemTime(new Date('2026-06-27T02:00:01Z'))
    expect((await metadata()).robots).toEqual({ index: false, follow: true })
    expect(await render()).toContain('This event has ended')
  })

  it('uses the London enrichment for both metadata and visible status', async () => {
    zone = 'Europe/London'
    vi.setSystemTime(new Date('2026-06-26T18:30:00Z'))
    expect((await metadata()).robots).toEqual({ index: false, follow: true })
    expect(await render()).toContain('This event has ended')
  })

  it('falls back to the home zone when enrichment has no zone', async () => {
    zone = null
    expect((await metadata()).robots).toBeUndefined()
    expect(await render()).not.toContain('This event has ended')
  })

  it('preserves the explicit cancelled label before the time cutoff', async () => {
    cancelled = true
    expect(await render()).toContain('This event was cancelled')
  })
})
