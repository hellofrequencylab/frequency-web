import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('react', () => ({ cache: <T>(fn: T) => fn }))
let going = 2
let pending = false
let failCount = false
let sharedCircle = false
let pace: string | null = null
const tables: string[] = []
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  tables.push(table)
  let range = [0, 499]
  const filters: Record<string, string> = {}
  const api = {
    select: () => api, eq: (key: string, value: string) => { filters[key] = value; return api }, neq: (key: string, value: string) => { filters[`${key}!=`] = value; return api }, in: () => api, or: () => api, order: () => api,
    range: (from: number, to: number) => { range = [from, to]; return api },
    maybeSingle: async () => ({ data: table === 'events' ? { energy_tag: pace, scope_id: 'circle', scope_type: 'circle' } : sharedCircle ? { circle_id: 'circle' } : null, error: null }),
    then: (resolve: (data: unknown) => unknown) => Promise.resolve(resolve(table === 'friendships' ? { data: range[0] === 0 ? [{ id: 'f1', user_a_id: 'viewer', user_b_id: 'friend' }] : [], error: null } : { count: pending && filters['approval_status!='] === 'pending' ? 0 : going, error: failCount ? { message: 'offline' } : null })),
  }
  return api
} }) }))
import { eventBlurb } from './event-blurb'
beforeEach(() => { going = 2; pending = false; failCount = false; sharedCircle = false; pace = null; tables.length = 0 })

describe('current event explanation facts', () => {
  it('rechecks social proof after RSVP changes rather than returning a same-day cached claim', async () => {
    expect(await eventBlurb('viewer', 'event')).toBe('2 connections are marked as going.')
    going = 0
    expect(await eventBlurb('viewer', 'event')).toBeNull()
    expect(tables).not.toContain('event_blurb_cache')
  })
  it('never presents a failed RSVP read as exact social proof', async () => {
    failCount = true
    expect(await eventBlurb('viewer', 'event')).toBeNull()
  })
  it('does not count pending approval and can return independently current membership facts', async () => {
    pending = true
    sharedCircle = true
    expect(await eventBlurb('viewer', 'event')).toBe('Hosted by a Circle you belong to.')
    sharedCircle = false
    expect(await eventBlurb('viewer', 'event')).toBeNull()
  })
  it('uses only current listed pace when there is no social overlap, without model-authored claims', async () => {
    going = 0
    pace = 'grounding'
    expect(await eventBlurb('viewer', 'event')).toBe('This event is listed as a calm, slow pace.')
    pace = 'invented'
    expect(await eventBlurb('viewer', 'event')).toBeNull()
  })
})
