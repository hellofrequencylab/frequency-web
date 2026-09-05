import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// ── RSVP writes that the DB refuses must not fire the "you're in" side-effects ─────────────────
//
// THE BUG (scan-2 L5-01, P1). Every `event_rsvps` insert/update in setRsvpStatus / toggleRSVP was
// awaited and its `error` discarded. readRsvpStatus then found no row and returned null, and the
// `stored ?? next` fallback treated the member's INTENT as the seat: gems paid, streak ticked, the
// "You're going" email + SMS sent, a CRM lead captured, while no RSVP row existed and the page still
// showed the member as not going. The concrete refused write today is a suspended member (migration
// 20270344000000 attaches trg_event_rsvps_block_suspended, which RAISEs on insert). Repeatable per
// tap, because each tap re-read "no existing row" and paid the first-RSVP gem again.
//
// Companions in the same file: the promoted waitlist seat is now handed to notifyPromotedSeat
// (L5-02), the approval gate fails CLOSED on a read error (L5-15), and checkInEvent names the
// reason it refused (L5-21).

const EVENT = 'event-1'
const ME = 'profile-me'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  /** The member's current event_rsvps row, as the admin pre-read returns it. */
  existing: null as Row | null,
  /** What readRsvpStatus finds AFTER the write; null = no row. */
  stored: null as string | null,
  /** The error every session-client event_rsvps write resolves with. */
  writeError: null as { code?: string; message: string } | null,
  /** events.rsvp_requires_approval, or an error on that read. */
  requiresApproval: false,
  approvalReadError: null as { message: string } | null,
  /** Whether the check-in window is open. */
  checkInWindowOpen: true,
}))

const fx = vi.hoisted(() => ({
  sessionWrites: [] as Array<{ op: 'insert' | 'update'; payload: Row }>,
  adminInserts: [] as Array<{ table: string; payload: Row }>,
  awardGems: vi.fn(async () => undefined),
  recordStreakActivity: vi.fn(async () => undefined),
  sendEmail: vi.fn(async () => undefined),
  sendSms: vi.fn(async () => ({ allowed: false })),
  captureEventLead: vi.fn(async () => undefined),
  promoteFromWaitlist: vi.fn(async () => null as null | Row),
  notifyPromotedSeat: vi.fn(async () => undefined),
  getMyProfileId: vi.fn(async () => ME as string | null),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const b: Row = {}
      const chain = () => b
      for (const m of ['select', 'eq', 'neq', 'is', 'in', 'order', 'limit']) b[m] = chain
      b.insert = (payload: Row) => {
        if (table === 'event_rsvps') fx.sessionWrites.push({ op: 'insert', payload })
        return b
      }
      b.update = (payload: Row) => {
        if (table === 'event_rsvps') fx.sessionWrites.push({ op: 'update', payload })
        return b
      }
      b.maybeSingle = async () => ({ data: null, error: null })
      b.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: table === 'event_rsvps' ? state.writeError : null })
      return b
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'me@example.com' } } }) } },
    from: (table: string) => {
      let cols = ''
      const b: Row = {}
      const chain = () => b
      for (const m of ['eq', 'neq', 'is', 'in', 'order', 'limit']) b[m] = chain
      b.select = (c: string) => { cols = c; return b }
      b.insert = (payload: Row) => { fx.adminInserts.push({ table, payload }); return b }
      b.update = () => b
      b.delete = () => b
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null, count: 0 })
      b.maybeSingle = async () => {
        if (table === 'events') {
          if (cols === 'rsvp_requires_approval') {
            if (state.approvalReadError) return { data: null, error: state.approvalReadError }
            return { data: { rsvp_requires_approval: state.requiresApproval }, error: null }
          }
          return {
            data: {
              id: EVENT, is_cancelled: false, starts_at: '2030-06-01T17:00:00Z', ends_at: null,
              time_zone: null, details: null, host_id: 'profile-host', title: 'Sunrise breathwork',
              location: null, slug: 'sunrise', description: null, scope_id: null, scope_type: null,
              host: { display_name: 'Host' }, space_id: null, host_space_id: null, theme: null,
            },
            error: null,
          }
        }
        if (table === 'event_rsvps') {
          if (cols === 'status') return { data: state.stored ? { status: state.stored } : null, error: null }
          if (cols === 'status, approval_status') {
            return { data: state.existing, error: null }
          }
          return { data: state.existing, error: null }
        }
        if (table === 'profiles') {
          return { data: { display_name: 'Mia', auth_user_id: 'auth-1', home_timezone: null }, error: null }
        }
        return { data: null, error: null }
      }
      return b
    },
  }),
}))

vi.mock('@/lib/auth', () => ({
  getMyProfileId: fx.getMyProfileId,
  isPlatformStaff: async () => false,
  resolveCaller: async () => null,
}))
vi.mock('@/lib/core/load-capabilities', () => ({
  getEventCapabilities: async () => new Set<string>(),
  getCircleCapabilities: async () => new Set<string>(),
}))
vi.mock('@/lib/pricing/member-leadership', () => ({
  memberWithinLeadershipAllowance: async () => true,
  EVENT_CREATE_CAP_MESSAGE: 'cap',
}))
vi.mock('@/lib/achievements', () => ({
  processGamificationEvent: async () => undefined,
  recordStreakActivity: fx.recordStreakActivity,
}))
vi.mock('@/lib/gems', () => ({ awardGems: fx.awardGems }))
vi.mock('@/lib/zaps', () => ({ awardZapsForAction: async () => ({ amount: 0 }) }))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: async () => ({ recorded: false }) }))
vi.mock('@/lib/verification/attendance', () => ({ markVerifiedByAttendance: async () => undefined }))
vi.mock('@/lib/event-recurrence', () => ({
  propagateAnchorEditsToOccurrences: async () => undefined,
  generateOccurrencesForAnchor: async () => undefined,
}))
vi.mock('@/lib/events/event-drafts', () => ({ resolveRegionScopeId: async () => null }))
vi.mock('@/lib/events/placement', () => ({
  listSpaceEventCreatorIds: async () => [],
  journeyLinkPatch: (id: string | null) => ({ journey_id: id }),
}))
vi.mock('@/lib/journeys/authoring', () => ({ canEditJourney: async () => false }))
vi.mock('@/lib/events/event-lifecycle', () => ({ cancelAudit: () => ({}) }))
vi.mock('@/lib/events/cancellation', () => ({ refundAndNotifyForCancelledEvent: async () => undefined }))
vi.mock('@/lib/events/capacity', () => ({
  getCapacityInfo: async () => ({ capacity: null, going: 0, spotsLeft: null, isFull: false }),
  promoteFromWaitlist: fx.promoteFromWaitlist,
}))
// PB-2 ships this module; the action only needs the seam to exist.
vi.mock('@/lib/events/waitlist-notify', () => ({ notifyPromotedSeat: fx.notifyPromotedSeat }))
vi.mock('@/lib/events/store', () => ({ stampEventSpaceId: async (id?: string | null) => id ?? null }))
vi.mock('@/lib/circles/store', () => ({ spaceIdForCircle: async () => null }))
vi.mock('@/lib/events/checkin-enabled', () => ({ readEventCheckInEnabled: () => true }))
vi.mock('@/lib/events/checkin-window', () => ({ checkInWindowOpen: () => state.checkInWindowOpen }))
vi.mock('@/lib/events/admission', () => ({
  isPendingApproval: (r: { approval_status?: string }) => r.approval_status === 'pending',
}))
vi.mock('@/lib/events/rsvp-window', () => ({ rsvpWindowStateFromDetails: () => 'open' }))
vi.mock('@/lib/events/embeddings', () => ({ embedEvent: async () => undefined }))
vi.mock('@/lib/events/geocode', () => ({ saveEventLocation: async () => undefined }))
vi.mock('@/lib/events/geocode-provider', () => ({ nominatimGeocoder: {} }))
vi.mock('@/lib/email', () => ({ sendEventRsvpConfirmationEmail: fx.sendEmail }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true }) }))
vi.mock('@/lib/comms/sms', () => ({ sendSms: fx.sendSms }))
vi.mock('@/lib/crm/interactions', () => ({ recordContactInteraction: async () => undefined }))
vi.mock('@/lib/crm/lead-capture', () => ({ captureEventLead: fx.captureEventLead }))
vi.mock('@/lib/rewards/connector', () => ({ rewardConnectorAttendanceForCheckin: async () => undefined }))
vi.mock('@/lib/rewards/creation', () => ({
  awardCreationToken: async () => undefined,
  awardValidatedCreation: async () => undefined,
}))
vi.mock('@/components/events/add-to-calendar', () => ({ buildGoogleCalendarUrl: () => '' }))
vi.mock('@/lib/ai/events-ai', () => ({ draftEventSpark: async () => null }))
vi.mock('@/lib/studio/steer-store', () => ({ saveSteer: async () => undefined }))
vi.mock('@/lib/events/host-space', () => ({ resolveHostingSpaceIdFromRow: async () => 'space-1' }))

import { setRsvpStatus, toggleRSVP, checkInEvent } from './actions'

// The side-effects are fire-and-forget (`void (async () => …)()` and un-awaited promises), so a
// resolved action does not mean they have run. Drain the microtask queue a few times before
// asserting either way.
async function flush(): Promise<void> {
  for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r))
}

const SUSPENDED = {
  code: 'P0001',
  message: 'Account is suspended and cannot contribute until the suspension is lifted.',
}

beforeEach(() => {
  state.existing = null
  state.stored = null
  state.writeError = null
  state.requiresApproval = false
  state.approvalReadError = null
  state.checkInWindowOpen = true
  fx.sessionWrites.length = 0
  fx.adminInserts.length = 0
  fx.awardGems.mockClear()
  fx.recordStreakActivity.mockClear()
  fx.sendEmail.mockClear()
  fx.sendSms.mockClear()
  fx.captureEventLead.mockClear()
  fx.promoteFromWaitlist.mockReset()
  fx.promoteFromWaitlist.mockResolvedValue(null)
  fx.notifyPromotedSeat.mockClear()
  fx.getMyProfileId.mockResolvedValue(ME)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function expectNoSeatSideEffects() {
  expect(fx.awardGems).not.toHaveBeenCalled()
  expect(fx.recordStreakActivity).not.toHaveBeenCalled()
  expect(fx.sendEmail).not.toHaveBeenCalled()
  expect(fx.sendSms).not.toHaveBeenCalled()
  expect(fx.captureEventLead).not.toHaveBeenCalled()
  expect(fx.adminInserts.filter((i) => i.table === 'event_posts')).toHaveLength(0)
}

describe('L5-01: a refused RSVP write fires nothing and tells the caller', () => {
  it('setRsvpStatus(going): the suspended-member insert is refused → { error }, no gems / email / SMS / lead / feed line', async () => {
    state.writeError = SUSPENDED
    const res = await setRsvpStatus(EVENT, 'going', { slug: 'sunrise' })
    await flush()
    expect(res).toEqual({ error: 'Your account is suspended, so you cannot RSVP right now.' })
    expect(fx.sessionWrites.map((w) => w.op)).toEqual(['insert'])
    expectNoSeatSideEffects()
  })

  it('setRsvpStatus(going): any other refusal reads as a plain retry message', async () => {
    state.writeError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const res = await setRsvpStatus(EVENT, 'going')
    await flush()
    expect(res).toEqual({ error: 'Could not save your RSVP. Please try again.' })
    expectNoSeatSideEffects()
  })

  it('setRsvpStatus(going): the write lands and the row reads back going → side-effects run', async () => {
    state.stored = 'going'
    const res = await setRsvpStatus(EVENT, 'going', { slug: 'sunrise' })
    await flush()
    expect(res).toEqual({ data: undefined })
    expect(fx.awardGems).toHaveBeenCalledWith(ME, 'event_rsvp')
    expect(fx.recordStreakActivity).toHaveBeenCalledWith(ME, 'attendance')
    expect(fx.sendEmail).toHaveBeenCalledTimes(1)
    expect(fx.sendSms).toHaveBeenCalledTimes(1)
    expect(fx.captureEventLead).toHaveBeenCalledTimes(1)
    expect(fx.adminInserts.filter((i) => i.table === 'event_posts')).toHaveLength(1)
  })

  it('setRsvpStatus(going): the write reports success but no row can be read back → failure, no fallback to the intent', async () => {
    // The pre-fix `stored ?? next` fallback is exactly the path the suspended-member trigger
    // reached. With the error now read first this arm only fires on a server fault, and it must
    // still fire NOTHING.
    state.stored = null
    const res = await setRsvpStatus(EVENT, 'going')
    await flush()
    expect(res).toEqual({ error: 'Could not save your RSVP. Please try again.' })
    expectNoSeatSideEffects()
  })

  it('setRsvpStatus(going): the trigger demotes to waitlist → no gems, waitlist confirmation only', async () => {
    state.stored = 'waitlist'
    const res = await setRsvpStatus(EVENT, 'going')
    await flush()
    expect(res).toEqual({ data: undefined })
    expect(fx.awardGems).not.toHaveBeenCalled()
    expect(fx.sendEmail).toHaveBeenCalledTimes(1)
    expect((fx.sendEmail.mock.calls[0] as unknown[])[0]).toMatchObject({ status: 'waitlist' })
  })

  it('setRsvpStatus(not_going): a refused step-back keeps the seat, so nobody is promoted on top of it', async () => {
    state.existing = { id: 'rsvp-1', status: 'going', approval_status: 'none' }
    state.writeError = { message: 'permission denied for table event_rsvps' }
    const res = await setRsvpStatus(EVENT, 'not_going')
    expect(res).toEqual({ error: 'Could not save your RSVP. Please try again.' })
    expect(fx.promoteFromWaitlist).not.toHaveBeenCalled()
    expect(fx.notifyPromotedSeat).not.toHaveBeenCalled()
  })

  it('toggleRSVP: a refused first insert fires nothing (form action, so the refusal is only logged)', async () => {
    state.writeError = SUSPENDED
    await toggleRSVP(EVENT)
    await flush()
    expect(fx.sessionWrites.map((w) => w.op)).toEqual(['insert'])
    expectNoSeatSideEffects()
  })

  it('toggleRSVP: a landed first insert that reads back going pays the first-RSVP gem once', async () => {
    state.stored = 'going'
    await toggleRSVP(EVENT)
    await flush()
    expect(fx.awardGems).toHaveBeenCalledTimes(1)
    expect(fx.sendEmail).toHaveBeenCalledTimes(1)
  })
})

describe('L5-02: the promoted waitlist seat is handed to the notifier', () => {
  it('setRsvpStatus(not_going) frees a seat, promotes, and notifies the seat it moved', async () => {
    state.existing = { id: 'rsvp-1', status: 'going', approval_status: 'none' }
    const seat = { rsvpId: 'rsvp-2', profileId: 'profile-b', guestEmail: null }
    fx.promoteFromWaitlist.mockResolvedValue(seat)
    const res = await setRsvpStatus(EVENT, 'not_going')
    expect(res).toEqual({ data: undefined })
    expect(fx.promoteFromWaitlist).toHaveBeenCalledWith(EVENT)
    expect(fx.notifyPromotedSeat).toHaveBeenCalledWith(seat, EVENT)
  })

  it('a guest seat (no profile) is notified the same way', async () => {
    state.existing = { id: 'rsvp-1', status: 'going', approval_status: 'none' }
    const seat = { rsvpId: 'rsvp-3', profileId: null, guestEmail: 'guest@example.com' }
    fx.promoteFromWaitlist.mockResolvedValue(seat)
    await setRsvpStatus(EVENT, 'maybe')
    expect(fx.notifyPromotedSeat).toHaveBeenCalledWith(seat, EVENT)
  })

  it('nobody to promote → the notifier is never called', async () => {
    state.existing = { id: 'rsvp-1', status: 'going', approval_status: 'none' }
    await setRsvpStatus(EVENT, 'not_going')
    expect(fx.promoteFromWaitlist).toHaveBeenCalledTimes(1)
    expect(fx.notifyPromotedSeat).not.toHaveBeenCalled()
  })

  it('a notifier failure is logged and never fails the withdrawal', async () => {
    state.existing = { id: 'rsvp-1', status: 'going', approval_status: 'none' }
    fx.promoteFromWaitlist.mockResolvedValue({ rsvpId: 'rsvp-2', profileId: 'profile-b', guestEmail: null })
    fx.notifyPromotedSeat.mockRejectedValueOnce(new Error('smtp down'))
    const res = await setRsvpStatus(EVENT, 'not_going')
    expect(res).toEqual({ data: undefined })
  })

  it('toggleRSVP withdraw from going promotes and notifies too', async () => {
    state.existing = { id: 'rsvp-1', status: 'going', approval_status: 'none' }
    const seat = { rsvpId: 'rsvp-2', profileId: 'profile-b', guestEmail: null }
    fx.promoteFromWaitlist.mockResolvedValue(seat)
    await toggleRSVP(EVENT)
    expect(fx.notifyPromotedSeat).toHaveBeenCalledWith(seat, EVENT)
  })
})

describe('L5-15: the approval gate fails CLOSED on a read error', () => {
  it('setRsvpStatus(going): the rsvp_requires_approval read errors → the seat is written pending, nothing "you are in" fires', async () => {
    state.approvalReadError = { message: 'connection reset' }
    state.stored = 'going'
    const res = await setRsvpStatus(EVENT, 'going')
    await flush()
    expect(res).toEqual({ data: undefined })
    expect(fx.sessionWrites[0]?.payload).toMatchObject({ status: 'going', approval_status: 'pending' })
    expect(fx.awardGems).not.toHaveBeenCalled()
    expect(fx.sendEmail).not.toHaveBeenCalled()
    // A request still signals intent to the hosting Space, exactly as a real pending request does.
    expect(fx.captureEventLead).toHaveBeenCalledTimes(1)
  })

  it('toggleRSVP first RSVP: the same read error also lands as pending', async () => {
    state.approvalReadError = { message: 'connection reset' }
    state.stored = 'going'
    await toggleRSVP(EVENT)
    await flush()
    expect(fx.sessionWrites[0]?.payload).toMatchObject({ approval_status: 'pending' })
    expect(fx.awardGems).not.toHaveBeenCalled()
  })

  it('a clean read of false still admits directly', async () => {
    state.requiresApproval = false
    state.stored = 'going'
    await setRsvpStatus(EVENT, 'going')
    await flush()
    expect(fx.sessionWrites[0]?.payload).toMatchObject({ approval_status: 'none' })
    expect(fx.awardGems).toHaveBeenCalledTimes(1)
  })

  it('a row the host already approved never re-enters the queue, read error or not', async () => {
    state.existing = { id: 'rsvp-1', status: 'maybe', approval_status: 'approved' }
    state.approvalReadError = { message: 'connection reset' }
    state.stored = 'going'
    await setRsvpStatus(EVENT, 'going')
    await flush()
    expect(fx.sessionWrites[0]?.payload).toEqual({ status: 'going' })
    expect(fx.awardGems).not.toHaveBeenCalled() // an existing row is not a FIRST RSVP
    expect(fx.sendEmail).toHaveBeenCalledTimes(1)
  })
})

describe('L5-21: checkInEvent names the reason it refused', () => {
  it('window closed → reason window_closed', async () => {
    state.checkInWindowOpen = false
    expect(await checkInEvent(EVENT)).toEqual({ ok: false, reason: 'window_closed' })
  })

  it('not going → reason not_going; pending → reason pending', async () => {
    state.existing = { status: 'maybe', approval_status: 'none' }
    expect(await checkInEvent(EVENT)).toEqual({ ok: false, reason: 'not_going' })
    state.existing = { status: 'going', approval_status: 'pending' }
    expect(await checkInEvent(EVENT)).toEqual({ ok: false, reason: 'pending' })
  })

  it('signed out → reason signed_out', async () => {
    fx.getMyProfileId.mockResolvedValue(null)
    expect(await checkInEvent(EVENT)).toEqual({ ok: false, reason: 'signed_out' })
  })
})

// ── Source shape: the fallback cannot come back ────────────────────────────────────────────────

describe('source shape', () => {
  const src = readFileSync('app/(main)/events/actions.ts', 'utf8')
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

  it('no event_rsvps write is awaited and discarded', () => {
    // A bare `await <client>.from('event_rsvps').insert|update(` at the start of a statement is the
    // pre-fix shape. Every write must land in a destructure that reads `error`.
    expect(code).not.toMatch(/^\s*await\s+\w+\s*\n?\s*\.from\('event_rsvps'\)\s*\n?\s*\.(insert|update)\(/m)
  })

  it('the intent fallback is gone', () => {
    expect(code).not.toMatch(/stored\s*\?\?\s*next/)
  })

  it('the approval gate reads through the fail-closed local reader, not rsvp-depth', () => {
    expect(code).not.toContain("from '@/lib/events/rsvp-depth'")
    expect((code.match(/eventRequiresApprovalOrClosed\(eventId\)/g) ?? []).length).toBe(3)
  })

  it('both promotions hand the seat to the notifier', () => {
    expect((code.match(/if \(promoted\) await notifyPromotedSeat\(promoted, eventId\)/g) ?? []).length).toBe(2)
  })
})
