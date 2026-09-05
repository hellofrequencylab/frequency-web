import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'

// ── createEvent writes the `events` row through the ADMIN client ──────────────────────────────
//
// THE BUG (meta-scan R1). The insert ran on the SESSION client, and live RLS on `events` carries a
// policy pair no ordinary caller can satisfy at once:
//   • PERMISSIVE  `get_my_role() >= 'host' AND host_id = me`            (every `member` fails it)
//   • RESTRICTIVE `events_space_writable_ins` = can_write_space_content  (root arm is staff-only,
//                 and stampEventSpaceId stamps ROOT for every non-Space create, so `host` fails it)
// Net: only platform staff could create an event from /events/new. 52 members and 4 hosts saw
// "Could not create the event. Please try again." from a page that says creation is open to any
// signed-in member. The fix moves the write to the admin client, the way every sibling create path
// already does (lib/circles/events.ts, lib/journeys/runs.ts, app/(main)/admin/events/actions.ts);
// the app-level checks above the insert stay the authority.
//
// Two pins. The source-shape one fails if the receiver is switched back. The behavioural one runs
// the action with a session client that answers like the live policy (RLS denial) and an admin
// client that accepts, so a revert turns the `host`-role create back into the member-facing error.

const SRC = 'app/(main)/events/actions.ts'
const src = readFileSync(SRC, 'utf8')
// Line comments first: one of them reads `lib/billing/*)`, which a block-first stripper takes as
// an opening `/*` and swallows the whole function.
const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

function createEventBody(): string {
  const start = code.indexOf('export async function createEvent(')
  expect(start).toBeGreaterThan(-1)
  const rest = code.slice(start)
  // The function ends at the first top-level `\n}\n` after its opening.
  return rest.slice(0, rest.indexOf('\n}\n'))
}

describe('createEvent inserts the events row on the admin client (source shape)', () => {
  it('the .from(\'events\').insert( receiver is `admin`', () => {
    const body = createEventBody()
    // Exactly one events insert in the function, and its receiver token is `admin`.
    const inserts = body.match(/\.from\('events'\)\s*\.insert\(/g) ?? []
    expect(inserts).toHaveLength(1)
    expect(body).toMatch(/await\s+admin\s*\.from\('events'\)\s*\.insert\(/)
  })

  it('is mutation-proof: no session-client receiver on that insert, and no session client built', () => {
    const body = createEventBody()
    // The pre-fix shape was `await (supabase)\n    .from('events').insert(` — with or without the
    // parentheses, on one line or two.
    expect(body).not.toMatch(/await\s*\(?\s*supabase\s*\)?\s*\.from\('events'\)\s*\.insert\(/)
    // createEvent has no other use for a session client, so building one here is the tell that the
    // insert is about to go back through RLS.
    expect(body).not.toContain('await createClient()')
  })

  it('names the policy pair beside the insert so the next reader knows why', () => {
    // Comment text, read from the raw source (comments are stripped from `code`).
    const fnStart = src.indexOf('export async function createEvent(')
    const fn = src.slice(fnStart, src.indexOf('\nexport async function updateEvent', fnStart))
    expect(fn).toContain('events_space_writable_ins')
    expect(fn).toContain("get_my_role() >= 'host'")
  })
})

// ── Behavioural: a host-role caller's create reaches the admin insert ─────────────────────────

const HOST = 'profile-host-1'
const ROOT = 'space-root'
const REGION = 'scope-region-1'

const {
  adminFrom,
  adminInserts,
  sessionFrom,
  getMyProfileId,
} = vi.hoisted(() => {
  const adminInserts: Array<{ table: string; payload: Record<string, unknown> }> = []
  // A chainable fake: every filter returns the same builder; terminals resolve per table.
  function adminBuilder(table: string) {
    const b: Record<string, unknown> = {}
    const chain = () => b
    for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'in', 'order', 'limit']) b[m] = chain
    b.maybeSingle = async () => {
      if (table === 'profiles') return { data: { membership_tier: 'free' }, error: null }
      if (table === 'events') return { data: null, error: null }
      return { data: null, error: null }
    }
    b.single = async () => ({ data: { id: 'event-new-1' }, error: null })
    b.insert = (payload: Record<string, unknown>) => {
      adminInserts.push({ table, payload })
      return b
    }
    // The allowance count (`select('id', { count: 'exact', head: true })` then filters) awaits the
    // builder itself, so make it thenable with a zero count.
    b.then = (resolve: (v: unknown) => unknown) => resolve({ count: 0, data: null, error: null })
    return b
  }
  const adminFrom = vi.fn((table: string) => adminBuilder(table))
  // The SESSION client answers like production RLS does for a `host` on a root-stamped row: the
  // restrictive policy denies the insert. If the action ever writes through this client again the
  // behavioural test below fails with the member-facing error.
  function sessionBuilder() {
    const b: Record<string, unknown> = {}
    const chain = () => b
    for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'in', 'order', 'limit', 'insert']) b[m] = chain
    b.maybeSingle = async () => ({ data: null, error: null })
    b.single = async () => ({
      data: null,
      error: { code: '42501', message: 'new row violates row-level security policy for table "events"' },
    })
    return b
  }
  const sessionFrom = vi.fn(() => sessionBuilder())
  return { adminFrom, adminInserts, sessionFrom, getMyProfileId: vi.fn() }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: sessionFrom, auth: { getUser: async () => ({ data: { user: null } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: adminFrom }),
}))
vi.mock('@/lib/auth', () => ({
  getMyProfileId,
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
  recordStreakActivity: async () => undefined,
}))
vi.mock('@/lib/gems', () => ({ awardGems: async () => undefined }))
vi.mock('@/lib/zaps', () => ({ awardZapsForAction: async () => undefined }))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: async () => undefined }))
vi.mock('@/lib/verification/attendance', () => ({ markVerifiedByAttendance: async () => undefined }))
vi.mock('@/lib/event-recurrence', () => ({
  propagateAnchorEditsToOccurrences: async () => undefined,
  generateOccurrencesForAnchor: async () => undefined,
}))
vi.mock('@/lib/events/event-drafts', () => ({ resolveRegionScopeId: async () => REGION }))
vi.mock('@/lib/events/placement', () => ({
  listSpaceEventCreatorIds: async () => [],
  journeyLinkPatch: (id: string | null) => ({ journey_id: id }),
}))
vi.mock('@/lib/journeys/authoring', () => ({ canEditJourney: async () => false }))
vi.mock('@/lib/events/event-lifecycle', () => ({ cancelAudit: () => ({}) }))
vi.mock('@/lib/events/cancellation', () => ({ refundAndNotifyForCancelledEvent: async () => undefined }))
vi.mock('@/lib/events/capacity', () => ({
  getCapacityInfo: async () => null,
  promoteFromWaitlist: async () => undefined,
}))
vi.mock('@/lib/events/rsvp-depth', () => ({ eventRequiresApproval: () => false }))
vi.mock('@/lib/events/store', () => ({ stampEventSpaceId: async (id?: string | null) => id ?? ROOT }))
vi.mock('@/lib/circles/store', () => ({ spaceIdForCircle: async () => ROOT }))
vi.mock('@/lib/events/checkin-enabled', () => ({ readEventCheckInEnabled: () => false }))
vi.mock('@/lib/events/checkin-window', () => ({ checkInWindowOpen: () => false }))
vi.mock('@/lib/events/admission', () => ({ isPendingApproval: () => false }))
vi.mock('@/lib/events/rsvp-window', () => ({ rsvpWindowStateFromDetails: () => ({ state: 'open' }) }))
vi.mock('@/lib/events/embeddings', () => ({ embedEvent: async () => undefined }))
vi.mock('@/lib/events/geocode', () => ({ saveEventLocation: async () => undefined }))
vi.mock('@/lib/events/geocode-provider', () => ({ nominatimGeocoder: {} }))
vi.mock('@/lib/email', () => ({ sendEventRsvpConfirmationEmail: async () => undefined }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: false }) }))
vi.mock('@/lib/comms/sms', () => ({ sendSms: async () => undefined }))
vi.mock('@/lib/crm/interactions', () => ({ recordContactInteraction: async () => undefined }))
vi.mock('@/lib/crm/lead-capture', () => ({ captureEventLead: async () => undefined }))
vi.mock('@/lib/rewards/connector', () => ({ rewardConnectorAttendanceForCheckin: async () => undefined }))
vi.mock('@/lib/rewards/creation', () => ({ awardCreationToken: async () => undefined }))
vi.mock('@/components/events/add-to-calendar', () => ({ buildGoogleCalendarUrl: () => '' }))
vi.mock('@/lib/ai/events-ai', () => ({ draftEventSpark: async () => null }))
vi.mock('@/lib/studio/steer-store', () => ({ saveSteer: async () => undefined }))
vi.mock('@/lib/events/host-space', () => ({ resolveHostingSpaceIdFromRow: () => null }))

import { createEvent } from './actions'
import { isError } from '@/lib/action-result'

function hostForm(): FormData {
  const fd = new FormData()
  fd.set('title', 'Sunrise breathwork')
  fd.set('startsAt', '2027-03-01T07:00')
  fd.set('scopeType', 'public')
  // A crafted field the action must NOT honour as identity.
  fd.set('hostId', 'someone-else')
  fd.set('host_id', 'someone-else')
  return fd
}

beforeEach(() => {
  adminInserts.length = 0
  adminFrom.mockClear()
  sessionFrom.mockClear()
  getMyProfileId.mockResolvedValue(HOST)
})

describe('createEvent (behavioural): a host-role caller reaches the admin insert', () => {
  it('creates the event through the admin client and never touches the session client', async () => {
    const res = await createEvent(hostForm())
    expect(isError(res)).toBe(false)
    if (!isError(res)) expect(res.data.slug).toMatch(/^sunrise-breathwork-2027-03-01/)
    const eventInserts = adminInserts.filter((i) => i.table === 'events')
    expect(eventInserts).toHaveLength(1)
    // The session client answers with the live RLS denial; a revert would route the write there.
    expect(sessionFrom).not.toHaveBeenCalled()
  })

  it('stamps host_id from the VERIFIED caller and the scope from the re-derived ownership', async () => {
    await createEvent(hostForm())
    const payload = adminInserts.find((i) => i.table === 'events')?.payload
    expect(payload).toBeDefined()
    expect(payload?.host_id).toBe(HOST)
    expect(payload?.scope_id).toBe(REGION)
    expect(payload?.scope_type).toBe('public')
    expect(payload?.space_id).toBe(ROOT)
    // The service role must not widen what the form can write: no identity taken from the body.
    expect(payload?.host_id).not.toBe('someone-else')
    expect(payload).not.toHaveProperty('hostId')
    expect(payload?.host_space_id).toBeUndefined()
  })

  it('still fails closed when there is no verified caller (the app-level checks stay the authority)', async () => {
    getMyProfileId.mockResolvedValue(null)
    const res = await createEvent(hostForm())
    expect(isError(res)).toBe(true)
    expect(adminInserts.filter((i) => i.table === 'events')).toHaveLength(0)
  })
})
