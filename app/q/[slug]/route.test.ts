import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// The event branch of the QR door carries its outcome (scan-2 L5-21).
//
// Both action results used to be dropped, so a refused RSVP write and a refused check-in both
// landed the scanner on the event page with nothing to say. Now:
//   * a refused RSVP write (`{ error }`)              → /events/<slug>?door=rsvp_refused
//   * a refused check-in (`{ ok: false, reason }`)     → /events/<slug>?door=<reason>
//   * an action that THROWS                            → /events/<slug>?door=failed, logged at warn
//   * both went through                                → /events/<slug> with no flag
// The door never 500s. Pinned on FAKES for the two actions; the page's rendering of `?door=` is the
// page owner's row (app/q/qr-event-rsvp.test.ts pins the call shape, this file pins the outcome).
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>

const fx = vi.hoisted(() => ({
  setRsvpStatus: vi.fn(async (): Promise<unknown> => ({ data: undefined })),
  checkInEvent: vi.fn(async (): Promise<Row> => ({ ok: true })),
  warn: vi.fn(),
  profileId: 'member-1' as string | null,
}))

const CODE: Row = {
  id: 'code-1',
  active: true,
  valid_from: null,
  valid_until: null,
  destination_type: 'event',
  target_url: null,
  alt_target_url: null,
  switch_at: null,
  node_id: null,
  circle_id: null,
  event_id: 'event-1',
  purpose: null,
  owner_profile_id: null,
  source_tag: null,
  space_id: null,
  splash: null,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Row = {}
      b.select = () => b
      b.eq = () => b
      b.maybeSingle = async () => ({
        data: table === 'qr_codes' ? CODE : table === 'events' ? { slug: 'moon-circle', title: 'Moon Circle' } : null,
        error: null,
      })
      return b
    },
    rpc: () => ({ then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }) }),
  }),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => fx.profileId }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => undefined }))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: async () => ({ recorded: false }) }))
vi.mock('@/app/(main)/circles/actions', () => ({ joinCircle: async () => undefined }))
vi.mock('@/app/(main)/events/actions', () => ({
  setRsvpStatus: fx.setRsvpStatus,
  checkInEvent: fx.checkInEvent,
}))
vi.mock('@/lib/entry-points/ab', () => ({ listActiveVariants: async () => [], pickVariant: () => null }))
vi.mock('@/lib/platform-flags', () => ({ referralsEnabled: async () => true }))
vi.mock('@/lib/connections/qr-capture', () => ({ captureQrContact: async () => null }))
vi.mock('@/lib/qr/event-invite', () => ({ makeEventInviteToken: () => 'token' }))
vi.mock('@/lib/crm/lead-capture', () => ({
  LEAD_GRAB_COOKIE: 'fq_lead',
  LEAD_GRAB_MAX_AGE: 60,
  encodeLeadGrab: () => '',
  linkMemberToSpaceLead: async () => undefined,
}))
vi.mock('@/lib/log', () => ({
  log: { info: vi.fn(), warn: fx.warn, error: vi.fn(), time: vi.fn() },
  briefError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

import { GET } from './route'

async function scan(): Promise<URL> {
  const res = await GET(new Request('https://frequency.test/q/moon'), { params: Promise.resolve({ slug: 'moon' }) })
  expect(res.status).toBeGreaterThanOrEqual(300)
  expect(res.status).toBeLessThan(400)
  return new URL(res.headers.get('location') ?? '')
}

beforeEach(() => {
  fx.setRsvpStatus.mockReset()
  fx.setRsvpStatus.mockResolvedValue({ data: undefined })
  fx.checkInEvent.mockReset()
  fx.checkInEvent.mockResolvedValue({ ok: true })
  fx.warn.mockClear()
  fx.profileId = 'member-1'
})

describe('the QR door carries its outcome to the event page', () => {
  it('success → the event page with NO flag', async () => {
    const url = await scan()
    expect(url.pathname).toBe('/events/moon-circle')
    expect(url.searchParams.has('door')).toBe(false)
    expect(fx.setRsvpStatus).toHaveBeenCalledWith('event-1', 'going')
    expect(fx.checkInEvent).toHaveBeenCalledWith('event-1')
    expect(fx.warn).not.toHaveBeenCalled()
  })

  it('🔴 a refused RSVP write → ?door=rsvp_refused, logged at warn', async () => {
    fx.setRsvpStatus.mockResolvedValue({ error: 'Your seat could not be saved.' })
    const url = await scan()
    expect(url.pathname).toBe('/events/moon-circle')
    expect(url.searchParams.get('door')).toBe('rsvp_refused')
    expect(fx.warn).toHaveBeenCalledWith('qr.door.rsvp_refused', expect.objectContaining({ eventId: 'event-1' }))
  })

  it('🔴 a refused check-in → ?door=<reason>', async () => {
    fx.checkInEvent.mockResolvedValue({ ok: false, reason: 'window_closed' })
    const url = await scan()
    expect(url.searchParams.get('door')).toBe('window_closed')
    expect(fx.warn).toHaveBeenCalledWith('qr.door.checkin_refused', expect.objectContaining({ reason: 'window_closed' }))
  })

  it('a refused RSVP wins over the not_going that follows from it', async () => {
    fx.setRsvpStatus.mockResolvedValue({ error: 'refused' })
    fx.checkInEvent.mockResolvedValue({ ok: false, reason: 'not_going' })
    const url = await scan()
    expect(url.searchParams.get('door')).toBe('rsvp_refused')
  })

  it('a silent void from setRsvpStatus (signed out / closed) is not a refusal', async () => {
    fx.setRsvpStatus.mockResolvedValue(undefined)
    const url = await scan()
    expect(url.searchParams.has('door')).toBe(false)
  })

  it('the door never 500s: a throwing action → ?door=failed, logged at warn', async () => {
    fx.setRsvpStatus.mockRejectedValue(new Error('boom'))
    fx.checkInEvent.mockRejectedValue(new Error('boom again'))
    const url = await scan()
    expect(url.pathname).toBe('/events/moon-circle')
    expect(url.searchParams.get('door')).toBe('failed')
    expect(fx.warn).toHaveBeenCalledWith('qr.door.rsvp_threw', expect.objectContaining({ error: 'boom' }))
    expect(fx.warn).toHaveBeenCalledWith('qr.door.checkin_threw', expect.objectContaining({ error: 'boom again' }))
  })

  it('an anonymous scan runs neither action and carries no flag', async () => {
    fx.profileId = null
    const url = await scan()
    expect(url.pathname).toBe('/events/moon-circle')
    expect(url.searchParams.has('door')).toBe(false)
    expect(fx.setRsvpStatus).not.toHaveBeenCalled()
    expect(fx.checkInEvent).not.toHaveBeenCalled()
  })
})
