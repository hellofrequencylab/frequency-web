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
  // The circle branch (SCAN-774): the helper the route joins through, and the minter verdict.
  joinCircleAsMember: vi.fn(async (): Promise<unknown> => ({ ok: true, joined: true })),
  mayInvite: vi.fn(async (): Promise<boolean> => true),
  code: { destination_type: 'event', event_id: 'event-1', circle_id: null } as Record<string, unknown>,
}))

const BASE_CODE: Row = {
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
  created_by: null,
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
        data:
          table === 'qr_codes'
            ? { ...BASE_CODE, ...fx.code }
            : table === 'events'
              ? { slug: 'moon-circle', title: 'Moon Circle' }
              : table === 'circles'
                ? { slug: 'quiet-room', host_id: 'host-1', space_id: 'space-1' }
                : null,
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
vi.mock('@/lib/circles/join', () => ({ joinCircleAsMember: fx.joinCircleAsMember }))
vi.mock('@/lib/qr/circle-invite', () => ({
  qrCodeMinterMayInvite: fx.mayInvite,
  isSpaceSteward: async () => true,
}))
vi.mock('@/app/(main)/events/actions', () => ({
  setRsvpStatus: fx.setRsvpStatus,
  checkInEvent: fx.checkInEvent,
}))
vi.mock('@/lib/entry-points/ab', () => ({ listActiveVariants: async () => [], pickVariant: () => null }))
vi.mock('@/lib/platform-flags', () => ({ referralsEnabled: async () => true }))
vi.mock('@/lib/connections/qr-capture', () => ({ captureQrContact: async () => null }))
vi.mock('@/lib/qr/event-invite', () => ({ makeEventInviteToken: () => 'token' }))
vi.mock('@/lib/crm/lead-capture', () => ({
  LEAD_GRAB_COOKIE: 'fq_lead_grab',
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
  fx.joinCircleAsMember.mockClear()
  fx.mayInvite.mockReset()
  fx.mayInvite.mockResolvedValue(true)
  fx.code = { destination_type: 'event', event_id: 'event-1', circle_id: null }
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

  it('🔴 an anonymous scan runs neither action and lands on the guest form: ?door=guest (PROG-GD4)', async () => {
    // The event page renders `door=guest` as the guest door line and leads with the guest RSVP
    // form for this event (app/(main)/events/[slug]/page.tsx, door-note.ts), instead of the note
    // explaining that checking in needs an account.
    fx.profileId = null
    const url = await scan()
    expect(url.pathname).toBe('/events/moon-circle')
    expect(url.searchParams.get('door')).toBe('guest')
    expect(fx.setRsvpStatus).not.toHaveBeenCalled()
    expect(fx.checkInEvent).not.toHaveBeenCalled()
    expect(fx.warn).not.toHaveBeenCalled()
  })

  it('a signed-in scan is unchanged by the guest door: both actions run and no guest flag rides', async () => {
    fx.profileId = 'member-1'
    const url = await scan()
    expect(url.pathname).toBe('/events/moon-circle')
    expect(url.searchParams.get('door')).not.toBe('guest')
    expect(fx.setRsvpStatus).toHaveBeenCalledWith('event-1', 'going')
    expect(fx.checkInEvent).toHaveBeenCalledWith('event-1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The circle branch (SCAN-774). A circle code used to be treated as the Host's invite no matter
// who minted it, and it went through the exported joinCircle Server Action with `invited: true`,
// a flag any browser could pass on its own. Now the route asks who minted the code and joins
// through the plain helper, which is not an action at all.
// ─────────────────────────────────────────────────────────────────────────────

describe('the QR circle door only invites when the minter could have', () => {
  beforeEach(() => {
    fx.code = { destination_type: 'circle', event_id: null, circle_id: 'circle-1', created_by: 'host-1' }
  })

  it('a code minted by someone trusted joins the scanner as invited', async () => {
    const url = await scan()
    expect(url.pathname).toBe('/circles/quiet-room')
    expect(fx.mayInvite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ created_by: 'host-1' }),
      expect.objectContaining({ host_id: 'host-1', space_id: 'space-1' }),
    )
    expect(fx.joinCircleAsMember).toHaveBeenCalledWith('member-1', 'circle-1', { invited: true })
  })

  it('🔴 a code minted by a stranger is NOT an invite: the join runs through the default deny', async () => {
    fx.mayInvite.mockResolvedValue(false)
    const url = await scan()
    expect(url.pathname).toBe('/circles/quiet-room')
    expect(fx.joinCircleAsMember).toHaveBeenCalledWith('member-1', 'circle-1', { invited: false })
  })

  it('a minter check that throws reads as not invited, and the scan still lands', async () => {
    fx.mayInvite.mockRejectedValue(new Error('db away'))
    const url = await scan()
    expect(url.pathname).toBe('/circles/quiet-room')
    expect(fx.joinCircleAsMember).toHaveBeenCalledWith('member-1', 'circle-1', { invited: false })
  })

  it('an anonymous scan joins nobody and lands on the circle', async () => {
    fx.profileId = null
    const url = await scan()
    expect(url.pathname).toBe('/circles/quiet-room')
    expect(fx.mayInvite).not.toHaveBeenCalled()
    expect(fx.joinCircleAsMember).not.toHaveBeenCalled()
  })

  it('a refused or throwing join never breaks the scan', async () => {
    fx.joinCircleAsMember.mockRejectedValueOnce(new Error('boom'))
    const url = await scan()
    expect(url.pathname).toBe('/circles/quiet-room')
  })
})
