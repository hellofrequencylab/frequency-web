import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import { sourceWithoutComments } from '@/test/source-shape'

// LIVE-652 — reportContent stored a report without reading its target.
//
// THE DEFECT. The action allowed the target TYPE and that an id was sent, then
// inserted. A report could name any UUID and land in the moderation queue as
// something a moderator cannot open. SEC-3 (the moderation action acts on the
// report's own target) was already done; this is SEC-4 existence.
//
// SOURCE-SHAPE: the failure is a missing read between the empty-id guard and
// the reports insert. A runtime happy-path of a real post still saving would
// not notice the hole.

const FILE = path.join(import.meta.dirname, 'report-actions.ts')
const src = sourceWithoutComments(FILE)

const TARGETS: ReadonlyArray<{ type: string; table: string }> = [
  { type: 'post', table: 'posts' },
  { type: 'comment', table: 'posts' },
  { type: 'dispatch', table: 'dispatches' },
  { type: 'member', table: 'profiles' },
  { type: 'event', table: 'events' },
  { type: 'guestbook', table: 'spotlight_guestbook' },
]

describe('reportContent refuses a target that does not exist (LIVE-652)', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(src.length).toBeGreaterThan(500)
    expect(src).toContain('export async function reportContent')
    expect(src).toContain('async function reportTargetExists')
  })

  it('reads the target after the empty-id guard and before the reports insert', () => {
    const a = src.indexOf('Missing report target')
    const b = src.search(/from\('reports'\)\.insert/)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    const mid = src.slice(a, b)
    expect(
      /reportTargetExists/.test(mid),
      'a report is stored without reading its target, so a report can name a post, member or event that does not exist (LIVE-652).',
    ).toBe(true)
  })

  it('returns the same refusal as a bad type when the target is missing', () => {
    expect(src).toContain("fail('Invalid report target')")
    const a = src.indexOf('Missing report target')
    const b = src.search(/from\('reports'\)\.insert/)
    expect(src.slice(a, b)).toContain("fail('Invalid report target')")
  })

  it.each(TARGETS)('reads $table for a $type target', ({ type, table }) => {
    const helperStart = src.indexOf('async function reportTargetExists')
    const helperEnd = src.indexOf('export async function reportContent')
    expect(helperStart).toBeGreaterThan(0)
    expect(helperEnd).toBeGreaterThan(helperStart)
    const helper = src.slice(helperStart, helperEnd)
    const caseIdx = helper.indexOf(`case '${type}'`)
    expect(caseIdx, `no case for ${type}`).toBeGreaterThan(-1)
    const nextCase = helper.indexOf('case ', caseIdx + 1)
    const body = helper.slice(caseIdx, nextCase < 0 ? undefined : nextCase)
    expect(body).toContain(`.from('${table}')`)
  })
})

// ── SCAN-679 · the report queue is scoped like the policies, not like "host+" ──────────────────
//
// THE DEFECT. resolveModerator returned the caller as soon as community_role was host+, and
// reviewReport, warnMember, suspendMember and cancelEventFromReport wrote through the admin client
// on that alone. `host` is self-granted (ensureHostOnOwnership promotes whoever publishes a Circle),
// so any member who published one Circle could file a report on anyone and then suspend them, hide
// any post, or cancel any event. OWN-054 closed this for deletePost/pinPost; this file was missed.
//
// RUNTIME, because the consequence is observable: a table-driven admin mock records every update
// and each refusal asserts that NOTHING was written.

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let writes: Array<{ table: string; patch: Row; matched: number }> = []

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let patch: Row | null = null
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const api = {
    select() { return api },
    update(p: Row) { patch = p; return api },
    eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return api },
    in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return api },
    limit() { return api },
    async maybeSingle() {
      const matched = rows()
      if (patch) { for (const r of matched) Object.assign(r, patch); writes.push({ table, patch, matched: matched.length }) }
      return { data: matched[0] ?? null, error: null }
    },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      const matched = rows()
      if (patch) { for (const r of matched) Object.assign(r, patch); writes.push({ table, patch, matched: matched.length }) }
      resolve({ data: matched, error: null })
    },
  }
  return api
}

type Caller = { id: string; community_role: string; webRole: string }
const mocks = vi.hoisted(() => ({
  getCallerProfile: vi.fn<() => Promise<Caller | null>>(),
  getStaffMember: vi.fn<() => Promise<{ profileId: string; role: string } | null>>(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.getCallerProfile }))
vi.mock('@/lib/staff', () => ({ getStaffMember: mocks.getStaffMember }))
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { reviewReport, warnMember, suspendMember, cancelEventFromReport } from './report-actions'
import { isError } from '@/lib/action-result'

const HOST = 'host-1'
const STAFF = 'staff-1'
const VICTIM = 'victim-1'
const MY_CIRCLE = 'circle-mine'
const THEIR_CIRCLE = 'circle-theirs'
const R_VICTIM = 'report-member'
const R_VICTIM_BY_HOST = 'report-member-by-host'
const R_STAFF = 'report-staff'
const R_SELF = 'report-self'
const R_EVENT = 'report-event'
const R_INSIDE = 'report-post-inside'
const R_OUTSIDE = 'report-post-outside'
const R_DISPATCH = 'report-dispatch'

function seed() {
  tables = {
    circles: [
      { id: MY_CIRCLE, host_id: HOST },
      { id: THEIR_CIRCLE, host_id: 'someone-else' },
    ],
    posts: [
      { id: 'post-inside', author_id: 'author', scope_id: MY_CIRCLE, hidden_at: null },
      { id: 'post-outside', author_id: 'author', scope_id: THEIR_CIRCLE, hidden_at: null },
    ],
    dispatches: [{ id: 'dispatch-1', hidden_at: null }],
    events: [{ id: 'event-1', status: 'published' }],
    profiles: [
      { id: VICTIM, web_role: 'none', suspended_at: null },
      { id: STAFF, web_role: 'admin', suspended_at: null },
      { id: HOST, web_role: 'none', suspended_at: null },
    ],
    team_members: [],
    reports: [
      { id: R_VICTIM, target_type: 'member', target_id: VICTIM, reporter_id: 'reporter', status: 'pending' },
      { id: R_VICTIM_BY_HOST, target_type: 'member', target_id: VICTIM, reporter_id: HOST, status: 'pending' },
      { id: R_STAFF, target_type: 'member', target_id: STAFF, reporter_id: 'reporter', status: 'pending' },
      { id: R_SELF, target_type: 'member', target_id: STAFF, reporter_id: STAFF, status: 'pending' },
      { id: R_EVENT, target_type: 'event', target_id: 'event-1', reporter_id: HOST, status: 'pending' },
      { id: R_INSIDE, target_type: 'post', target_id: 'post-inside', reporter_id: 'reporter', status: 'pending' },
      { id: R_OUTSIDE, target_type: 'post', target_id: 'post-outside', reporter_id: 'reporter', status: 'pending' },
      { id: R_DISPATCH, target_type: 'dispatch', target_id: 'dispatch-1', reporter_id: 'reporter', status: 'pending' },
    ],
  }
  writes = []
}

const row = (table: string, id: string) => (tables[table] ?? []).find((r) => r.id === id)!
const asHost: Caller = { id: HOST, community_role: 'host', webRole: 'none' }
const asStaff: Caller = { id: STAFF, community_role: 'member', webRole: 'admin' }
const signInAs = (c: Caller) => mocks.getCallerProfile.mockResolvedValue(c)

beforeEach(() => {
  seed()
  vi.clearAllMocks()
  mocks.getStaffMember.mockResolvedValue(null)
})

describe('a self-granted host cannot moderate the platform through the report queue (SCAN-679)', () => {
  it('cannot suspend a member, even through a report someone else filed; nothing is written', async () => {
    signInAs(asHost)
    const r = await suspendMember(R_VICTIM, VICTIM, { durationDays: 7 })
    expect(isError(r)).toBe(true)
    expect(row('profiles', VICTIM).suspended_at).toBeNull()
    expect(row('reports', R_VICTIM).status).toBe('pending')
    expect(writes).toEqual([])
  })

  it('cannot warn a member', async () => {
    signInAs(asHost)
    const r = await warnMember(R_VICTIM, VICTIM, 'spam')
    expect(isError(r)).toBe(true)
    expect(writes).toEqual([])
  })

  it('cannot cancel an event', async () => {
    signInAs(asHost)
    const r = await cancelEventFromReport(R_EVENT, 'event-1')
    expect(isError(r)).toBe(true)
    expect(row('events', 'event-1').status).toBe('published')
    expect(writes).toEqual([])
  })

  it('cannot hide a post outside a Circle they host, nor a dispatch', async () => {
    signInAs(asHost)
    expect(isError(await reviewReport(R_OUTSIDE, 'actioned'))).toBe(true)
    expect(isError(await reviewReport(R_DISPATCH, 'actioned'))).toBe(true)
    expect(isError(await reviewReport(R_OUTSIDE, 'dismissed'))).toBe(true)
    expect(row('posts', 'post-outside').hidden_at).toBeNull()
    expect(row('dispatches', 'dispatch-1').hidden_at).toBeNull()
    expect(writes).toEqual([])
  })

  it('CAN hide a post inside a Circle they host, and the report closes', async () => {
    signInAs(asHost)
    const r = await reviewReport(R_INSIDE, 'actioned')
    expect(isError(r)).toBe(false)
    expect(row('posts', 'post-inside').hidden_at).not.toBeNull()
    expect(row('posts', 'post-inside').hidden_by).toBe(HOST)
    expect(row('reports', R_INSIDE).status).toBe('actioned')
  })
})

describe('platform moderation stays open to platform staff, with guard rails (SCAN-679)', () => {
  it('staff suspends a reported member', async () => {
    signInAs(asStaff)
    const r = await suspendMember(R_VICTIM, VICTIM, { durationDays: 7 })
    expect(isError(r)).toBe(false)
    expect(row('profiles', VICTIM).suspended_by).toBe(STAFF)
    expect(row('reports', R_VICTIM).status).toBe('actioned')
  })

  it('community-domain team staff (community_role member, web_role none) is platform too', async () => {
    signInAs({ id: 'team-1', community_role: 'member', webRole: 'none' })
    mocks.getStaffMember.mockResolvedValue({ profileId: 'team-1', role: 'support' })
    const r = await reviewReport(R_DISPATCH, 'actioned')
    expect(isError(r)).toBe(false)
    expect(row('dispatches', 'dispatch-1').hidden_at).not.toBeNull()
  })

  it('refuses a report the caller filed themselves', async () => {
    signInAs(asStaff)
    const r = await suspendMember(R_SELF, STAFF, {})
    expect(isError(r)).toBe(true)
    signInAs({ ...asHost, webRole: 'moderator' })
    expect(isError(await cancelEventFromReport(R_EVENT, 'event-1'))).toBe(true)
    expect(isError(await suspendMember(R_VICTIM_BY_HOST, VICTIM, {}))).toBe(true)
    expect(writes).toEqual([])
  })

  it('refuses staff and moderators as suspend targets', async () => {
    signInAs({ id: 'mod-1', community_role: 'member', webRole: 'moderator' })
    const r = await suspendMember(R_STAFF, STAFF, {})
    expect(isError(r)).toBe(true)
    expect(row('profiles', STAFF).suspended_at).toBeNull()
    expect(writes).toEqual([])
  })
})
