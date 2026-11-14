import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ viewer: vi.fn(), admin: vi.fn(), profile: { data: { home_timezone: 'America/Los_Angeles' }, error: null } as { data: { home_timezone: string } | null; error: unknown }, taxonomyError: null as unknown, pages: [] as { data: unknown[] | null; error: unknown }[], calls: [] as { table: string; select?: string; filters: [string, unknown][]; after?: string }[] }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: io.viewer }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: io.admin }))
import { getMemberSignature } from './frequency-signature-data'
const log = (id: string) => ({ id, logged_for: '2026-11-13', pillar_id: 'b', secondary_pillar_id: 'm', primary_pct: 75, practice: null })
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-14T02:00:00Z'))
  io.viewer.mockResolvedValue('owner'); io.calls = []; io.pages = []; io.profile = { data: { home_timezone: 'America/Los_Angeles' }, error: null }; io.taxonomyError = null
  io.admin.mockReset().mockImplementation(() => ({ from(table: string) {
    const call: typeof io.calls[number] = { table, filters: [] }; io.calls.push(call)
    const query = {
      select(value: string) { call.select = value; return query },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return query },
      in(key: string, value: unknown) { call.filters.push([key, value]); return query },
      gte(key: string, value: unknown) { call.filters.push([`gte:${key}`, value]); return query },
      lte(key: string, value: unknown) { call.filters.push([`lte:${key}`, value]); return query },
      gt(_key: string, value: string) { call.after = value; return query }, order() { return query }, limit() { return query },
      maybeSingle() { return Promise.resolve(io.profile) },
      then(resolve: (value: unknown) => unknown) {
        const value = table === 'pillars' ? { data: [['m', 'mind'], ['b', 'body'], ['s', 'spirit'], ['e', 'expression']].map(([id, slug]) => ({ id, slug })), error: io.taxonomyError } : io.pages.shift() ?? { data: [], error: null }
        return Promise.resolve(value).then(resolve)
      },
    }
    return query
  } }))
})
afterEach(() => vi.useRealTimers())
describe('owner practice rhythm reader', () => {
  it.each([null, 'other'])('denies %j before creating an admin client', async (viewer) => {
    io.viewer.mockResolvedValue(viewer)
    expect((await getMemberSignature('owner')).rhythm?.state).toBe('restricted')
    expect(io.admin).not.toHaveBeenCalled()
  })
  it('pages past a short provider page, scopes every page and excludes future dates', async () => {
    io.pages = [{ data: [log('a')], error: null }, { data: [log('b')], error: null }, { data: [], error: null }]
    const out = await getMemberSignature('owner')
    expect(out.rhythm).toMatchObject({ state: 'complete', activeDays: 1, days: { mind: 1, body: 1, spirit: 0, expression: 0 }, coverage: { frozenLogs: 2 } })
    const calls = io.calls.filter((c) => c.table === 'practice_logs')
    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c.after)).toEqual([undefined, 'a', 'b'])
    for (const c of calls) {
      expect(c.filters).toContainEqual(['profile_id', 'owner'])
      expect(c.filters).toContainEqual(['gte:logged_for', '2026-10-24'])
      expect(c.filters).toContainEqual(['lte:logged_for', '2026-11-13'])
      expect(c.select).toContain('pillar_id, secondary_pillar_id, primary_pct')
      expect(c.select).not.toContain('focus_details')
      expect(c.select).not.toContain('support_pillar_ids')
    }
  })
  it('reports an initial failure as unavailable rather than empty', async () => {
    io.pages = [{ data: null, error: new Error('failed') }]
    expect((await getMemberSignature('owner')).rhythm?.state).toBe('unavailable')
  })
  it('labels a later-page failure as partial', async () => {
    io.pages = [{ data: [log('a')], error: null }, { data: null, error: new Error('failed') }]
    expect((await getMemberSignature('owner')).rhythm).toMatchObject({ state: 'partial', complete: false, activeDays: 1 })
  })
  it('does not show a complete graph if timezone or taxonomy reads fail', async () => {
    io.profile.error = new Error('no profile')
    expect((await getMemberSignature('owner')).rhythm?.state).toBe('unavailable')
    io.profile.error = null; io.taxonomyError = new Error('no taxonomy')
    expect((await getMemberSignature('owner')).rhythm?.state).toBe('unavailable')
    expect(io.calls.filter((c) => c.table === 'practice_logs')).toHaveLength(0)
  })
  it('detects a repeated/nonadvancing page without pretending completeness', async () => {
    io.pages = [{ data: [log('a')], error: null }, { data: [log('a')], error: null }]
    expect((await getMemberSignature('owner')).rhythm).toMatchObject({ state: 'partial', activeDays: 1 })
  })
  it('distinguishes a complete empty history', async () => {
    expect((await getMemberSignature('owner')).rhythm).toMatchObject({ state: 'empty', complete: true })
  })
})
