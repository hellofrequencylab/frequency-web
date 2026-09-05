import { describe, it, expect, vi, beforeEach } from 'vitest'

// claimCircle (ADR-1048 Phase 2): a real member converts a demo circle into their own. The claim
// is THREE writes (the circle row, the claimer's membership, the chosen first practice) followed by
// two rewards and a claim log. What is locked here (scan2 L5-09):
//
//   1. EVERY WRITE IS READ. A refused membership or practice write is a refusal of the whole
//      claim, never a host with no membership row.
//   2. A FAILED STEP UNDOES WHAT LANDED. The circle goes back to demo under its prior host, the
//      membership the upsert created is deleted, and the practice rows it retired come back.
//   3. NOTHING IS PAID UNTIL ALL THREE LANDED. On any failure no Zaps are awarded and no claim is
//      logged; on success both run only after the last write.
//
// Network-free: auth, the admin client, the rate limit, and the reward engines are stubbed.

const mocks = vi.hoisted(() => ({
  awardZapsForAction: vi.fn(),
  recordEngagementEvent: vi.fn(),
  rateLimitOk: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) } }),
}))
vi.mock('@/lib/zaps', () => ({ awardZapsForAction: mocks.awardZapsForAction }))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: mocks.recordEngagementEvent }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: mocks.rateLimitOk }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

// ── A recording admin client. Every call is logged in order as { key, payload, filters }; a
// table.op key can be told to fail on its Nth call, and selects answer from a per-table row. ──
interface Call {
  key: string
  payload: unknown
  filters: Array<[string, unknown]>
}
const calls: Call[] = []
const failures: Record<string, number> = {}
const counts: Record<string, number> = {}
const rows: Record<string, unknown> = {}

function chain(call: Call) {
  const n = (counts[call.key] = (counts[call.key] ?? 0) + 1)
  const error = failures[call.key] === n ? { message: `${call.key} refused` } : null
  const api: Record<string, unknown> = {}
  const filter = (col: string, val: unknown) => {
    call.filters.push([col, val])
    return api
  }
  api.eq = filter
  api.in = filter
  api.select = () => api
  api.maybeSingle = async () => ({ data: rows[call.key] ?? null, error })
  api.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(resolve({ data: rows[call.key] ?? null, error }))
  return api
}

function builder(table: string) {
  const record = (op: string, payload: unknown = null) => {
    const call: Call = { key: `${table}.${op}`, payload, filters: [] }
    calls.push(call)
    return chain(call)
  }
  return {
    select: () => record('select'),
    update: (p: unknown) => record('update', p),
    upsert: (p: unknown) => record('upsert', p),
    insert: (p: unknown) => record('insert', p),
    delete: () => record('delete'),
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import { claimCircle } from './claim-actions'

const ME = 'profile-me'
const CIRCLE = 'circle-1'
const PRIOR_HOST = 'profile-demo-host'
const REFUSAL = 'Could not claim the circle. Nothing was changed. Try again.'

function keys(): string[] {
  return calls.map((c) => c.key)
}
function writes(): string[] {
  return keys().filter((k) => !k.endsWith('.select'))
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  for (const k of Object.keys(failures)) delete failures[k]
  for (const k of Object.keys(counts)) delete counts[k]
  for (const k of Object.keys(rows)) delete rows[k]
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.rateLimitOk.mockResolvedValue(true)
  mocks.awardZapsForAction.mockResolvedValue(null)
  mocks.recordEngagementEvent.mockResolvedValue({ ok: true })
  rows['profiles.select'] = { id: ME, is_demo: false }
  rows['circles.select'] = {
    id: CIRCLE,
    slug: 'sunrise-walk',
    is_demo: true,
    host_id: PRIOR_HOST,
    status: 'demo',
    name: 'Sunrise Walk',
    about: 'A sample circle.',
  }
  rows['memberships.select'] = null
  rows['circle_practices.select'] = [{ id: 'cp-1' }, { id: 'cp-2' }]
})

const answers = { name: 'My Walk', about: 'Ours now.', practiceId: 'practice-9' }

describe('claimCircle', () => {
  it('SUCCESS: circle, membership and practice all land, THEN the Zaps and the claim log run', async () => {
    const res = await claimCircle(CIRCLE, answers)

    expect(res).toEqual({ slug: 'sunrise-walk' })
    expect(writes()).toEqual([
      'circles.update',
      'memberships.upsert',
      'circle_practices.update',
      'circle_practices.insert',
    ])
    expect(mocks.awardZapsForAction).toHaveBeenCalledWith(ME, 'circle_start')
    expect(mocks.awardZapsForAction).toHaveBeenCalledWith(ME, 'circle_activate')
    expect(mocks.recordEngagementEvent).toHaveBeenCalledTimes(1)
    // The retire targets exactly the rows that were active, by id, so the undo can bring them back.
    const retire = calls.find((c) => c.key === 'circle_practices.update')
    expect(retire?.filters).toContainEqual(['id', ['cp-1', 'cp-2']])
  })

  it('MEMBERSHIP REFUSED: the circle goes back to demo under its prior host; nothing is paid', async () => {
    failures['memberships.upsert'] = 1

    await expect(claimCircle(CIRCLE, answers)).rejects.toThrow(REFUSAL)

    const circleUpdates = calls.filter((c) => c.key === 'circles.update')
    expect(circleUpdates).toHaveLength(2)
    expect(circleUpdates[1]?.payload).toMatchObject({
      is_demo: true,
      host_id: PRIOR_HOST,
      status: 'demo',
      name: 'Sunrise Walk',
      about: 'A sample circle.',
    })
    // The practice step was never reached.
    expect(keys()).not.toContain('circle_practices.insert')
    expect(mocks.awardZapsForAction).not.toHaveBeenCalled()
    expect(mocks.recordEngagementEvent).not.toHaveBeenCalled()
  })

  it('PRACTICE RETIRE REFUSED: the new membership is deleted and the circle reverted; nothing is paid', async () => {
    failures['circle_practices.update'] = 1

    await expect(claimCircle(CIRCLE, answers)).rejects.toThrow(REFUSAL)

    // Undo runs in reverse: membership first (it was created, so it is deleted), then the circle.
    const undoWrites = writes().slice(writes().indexOf('circle_practices.update') + 1)
    expect(undoWrites).toEqual(['memberships.delete', 'circles.update'])
    const del = calls.find((c) => c.key === 'memberships.delete')
    expect(del?.filters).toEqual([
      ['profile_id', ME],
      ['circle_id', CIRCLE],
    ])
    expect(keys()).not.toContain('circle_practices.insert')
    expect(mocks.awardZapsForAction).not.toHaveBeenCalled()
    expect(mocks.recordEngagementEvent).not.toHaveBeenCalled()
  })

  it('PRACTICE INSERT REFUSED: the retired rows come back, the membership goes, the circle reverts; nothing is paid', async () => {
    failures['circle_practices.insert'] = 1

    await expect(claimCircle(CIRCLE, answers)).rejects.toThrow(REFUSAL)

    const undoWrites = writes().slice(writes().indexOf('circle_practices.insert') + 1)
    expect(undoWrites).toEqual(['circle_practices.update', 'memberships.delete', 'circles.update'])
    const restore = calls.filter((c) => c.key === 'circle_practices.update')[1]
    expect(restore?.payload).toEqual({ active: true })
    expect(restore?.filters).toContainEqual(['id', ['cp-1', 'cp-2']])
    expect(mocks.awardZapsForAction).not.toHaveBeenCalled()
    expect(mocks.recordEngagementEvent).not.toHaveBeenCalled()
  })

  it('a prior membership is RESTORED rather than deleted when a later step fails', async () => {
    rows['memberships.select'] = { status: 'active', volunteer_role: null }
    failures['circle_practices.insert'] = 1

    await expect(claimCircle(CIRCLE, answers)).rejects.toThrow(REFUSAL)

    expect(keys()).not.toContain('memberships.delete')
    const restored = calls.find((c) => c.key === 'memberships.update')
    expect(restored?.payload).toEqual({ status: 'active', volunteer_role: null })
  })
})
