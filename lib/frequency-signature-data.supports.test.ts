import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ viewer: vi.fn(), admin: vi.fn(), pages: [] as { data: Record<string, unknown>[] | null; error: unknown }[], calls: [] as { table: string; select?: string; filters: [string, unknown][]; after?: string }[] }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: io.viewer }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: io.admin }))
import { getMemberSignature } from './frequency-signature-data'
import { practiceSupportLogColumns } from './practice-support-evidence-read'

const snapshot = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'a', logged_for: '2026-11-13', pillar_id: 'b', secondary_pillar_id: null, primary_pct: 100,
  support_pillar_ids: ['m', 'b', 's', 'e'], support_evidence_version: 1,
  practice: { domain_id: 'e', secondary_domain_id: null, primary_pct: 100 }, ...over })
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-14T02:00:00Z'))
  vi.stubEnv('PRACTICE_SUPPORT_EVIDENCE_ENABLED', '')
  io.viewer.mockResolvedValue('owner'); io.calls = []; io.pages = []
  io.admin.mockReset().mockImplementation(() => ({ from(table: string) {
    const call: typeof io.calls[number] = { table, filters: [] }; io.calls.push(call)
    const query = {
      select(value: string) { call.select = value; return query },
      eq(key: string, value: unknown) { call.filters.push([key, value]); return query },
      in(key: string, value: unknown) { call.filters.push([key, value]); return query },
      gte(key: string, value: unknown) { call.filters.push([`gte:${key}`, value]); return query },
      lte(key: string, value: unknown) { call.filters.push([`lte:${key}`, value]); return query },
      gt(_key: string, value: string) { call.after = value; return query }, order() { return query }, limit() { return query },
      maybeSingle() { return Promise.resolve({ data: { home_timezone: 'America/Los_Angeles' }, error: null }) },
      then(resolve: (value: unknown) => unknown) {
        if (table === 'pillars') return Promise.resolve({ data: [['m', 'mind'], ['b', 'body'], ['s', 'spirit'], ['e', 'expression']].map(([id, slug]) => ({ id, slug })), error: null }).then(resolve)
        const page = io.pages.shift() ?? { data: [], error: null }
        // Model the actual PostgREST projection: unselected future fields cannot reach the adapter.
        const data = page.data?.map((raw) => {
          const value = { ...raw }
          if (!call.select?.includes('support_pillar_ids')) { delete value.support_pillar_ids; delete value.support_evidence_version }
          return value
        }) ?? null
        return Promise.resolve({ data, error: page.error }).then(resolve)
      },
    }
    return query
  } }))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('schema-gated multi-support owner read', () => {
  it.each(['', ' ', 'false', '0', 'off'])('keeps future schema dark for %j', async (value) => {
    vi.stubEnv('PRACTICE_SUPPORT_EVIDENCE_ENABLED', value)
    io.pages = [{ data: [snapshot()], error: null }, { data: [], error: null }]
    const out = await getMemberSignature('owner')
    expect(out.rhythm?.days).toEqual({ mind: 0, body: 1, spirit: 0, expression: 0 })
    for (const call of io.calls.filter((c) => c.table === 'practice_logs')) {
      expect(call.select).not.toContain('support_pillar_ids')
      expect(call.select).not.toContain('support_evidence_version')
    }
  })
  it.each(['1', 'true', ' ON '])('reads all four immutable supports for %j without multiplying active days', async (value) => {
    vi.stubEnv('PRACTICE_SUPPORT_EVIDENCE_ENABLED', value)
    io.pages = [{ data: [snapshot()], error: null }, { data: [], error: null }]
    const out = await getMemberSignature('owner')
    expect(out.rhythm).toMatchObject({ state: 'complete', activeDays: 1, days: { mind: 1, body: 1, spirit: 1, expression: 1 }, coverage: { frozenLogs: 1 } })
    const calls = io.calls.filter((c) => c.table === 'practice_logs')
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.select).toContain('support_pillar_ids')
      expect(call.select).toContain('support_evidence_version')
      expect(call.filters).toContainEqual(['profile_id', 'owner'])
      expect(call.filters).toContainEqual(['gte:logged_for', '2026-10-24'])
      expect(call.filters).toContainEqual(['lte:logged_for', '2026-11-13'])
    }
  })
  it('keeps four-area recorded evidence after current category edits or practice deletion', async () => {
    vi.stubEnv('PRACTICE_SUPPORT_EVIDENCE_ENABLED', 'on')
    for (const practice of [{ domain_id: 'm', secondary_domain_id: null, primary_pct: 100 }, null]) {
      io.pages = [{ data: [snapshot({ practice })], error: null }, { data: [], error: null }]
      expect((await getMemberSignature('owner')).rhythm?.days).toEqual({ mind: 1, body: 1, spirit: 1, expression: 1 })
    }
  })
  it('does not invent historical extra supports for a null legacy evidence version', async () => {
    vi.stubEnv('PRACTICE_SUPPORT_EVIDENCE_ENABLED', 'on')
    io.pages = [{ data: [snapshot({ support_pillar_ids: null, support_evidence_version: null })], error: null }, { data: [], error: null }]
    expect((await getMemberSignature('owner')).rhythm?.days).toEqual({ mind: 0, body: 1, spirit: 0, expression: 0 })
  })
  it.each([null, 'other'])('does not create an admin client for %j with the flag enabled', async (viewer) => {
    vi.stubEnv('PRACTICE_SUPPORT_EVIDENCE_ENABLED', 'on'); io.viewer.mockResolvedValue(viewer)
    expect((await getMemberSignature('owner')).rhythm?.state).toBe('restricted')
    expect(io.admin).not.toHaveBeenCalled()
  })
  it('fails visibly on an enabled-path schema error without silently downgrading the select', async () => {
    vi.stubEnv('PRACTICE_SUPPORT_EVIDENCE_ENABLED', 'on')
    io.pages = [{ data: null, error: { code: '42703' } }]
    expect((await getMemberSignature('owner')).rhythm?.state).toBe('unavailable')
    const calls = io.calls.filter((c) => c.table === 'practice_logs')
    expect(calls).toHaveLength(1)
    expect(calls[0].select).toContain('support_pillar_ids')
  })
  it('reads the runtime switch at call time and keeps blank values off', () => {
    const old = practiceSupportLogColumns()
    vi.stubEnv('PRACTICE_SUPPORT_EVIDENCE_ENABLED', 'true')
    expect(practiceSupportLogColumns()).toContain('support_evidence_version')
    vi.stubEnv('PRACTICE_SUPPORT_EVIDENCE_ENABLED', '')
    expect(practiceSupportLogColumns()).toBe(old)
  })
})
