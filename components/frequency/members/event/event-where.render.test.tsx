import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FqEventWhere } from './event-panels'

const context = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/lib/events/active-event', () => ({ getEventContext: () => context.value }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./event-map', () => ({ FqEventMap: () => <div data-testid="event-map" /> }))
vi.mock('./message-host', () => ({ FqMessageHost: () => null }))

describe('event location and remote access', () => {
  it('shows both venue and the admitted remote action for a hybrid event', () => {
    context.value = {
      facts: {
        isOnline: false,
        hasOnlineAttendance: true,
        onlineUrl: 'https://meet.example.com/room',
        location: 'Community Garden',
        venuePoint: { lat: 32.8, lng: -117.2 },
        mapPin: null,
        mapsHref: 'https://maps.example.com/?q=Community+Garden',
      },
    }

    const html = renderToStaticMarkup(FqEventWhere())
    expect(html).toContain('Join link')
    expect(html).toContain('https://meet.example.com/room')
    expect(html).toContain('Community Garden')
    expect(html).toContain('data-testid="event-map"')
  })

  it('keeps the venue visible but withholds a hybrid join action until admitted', () => {
    context.value = {
      facts: {
        isOnline: false,
        hasOnlineAttendance: true,
        onlineUrl: null,
        location: 'Community Garden',
        venuePoint: null,
        mapPin: null,
        mapsHref: null,
      },
    }

    const html = renderToStaticMarkup(FqEventWhere())
    expect(html).toContain('Online. Link shows once you RSVP.')
    expect(html).not.toContain('href="https://meet.example.com/room"')
    expect(html).toContain('Community Garden')
  })
})
