import { beforeEach, expect, it, vi } from 'vitest'
const { results, calls } = vi.hoisted(() => ({ results: {} as Record<string, unknown>, calls: [] as string[] }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const q = { select: () => q, eq: (field: string, value: string) => { calls.push(`${table}.${field}:${value}`); return q }, gte: () => q, lte: () => q, maybeSingle: () => Promise.resolve(results[table]), then: (resolve: (v: unknown) => void) => Promise.resolve(results[table]).then(resolve) }
  return q
} }) }))
import { loadPracticeWeek } from './practice-week-data'
beforeEach(() => { calls.length = 0; results.profiles = { data: { home_timezone: 'UTC' }, error: null }; results.practice_sessions = { data: [], error: null }; results.practice_logs = { data: [], error: null } })
it('scopes every read to the authenticated caller supplied by the Feed and returns seven real empty days', async () => {
  expect(await loadPracticeWeek('viewer')).toHaveLength(7)
  expect(calls).toEqual(['profiles.id:viewer', 'practice_sessions.profile_id:viewer', 'practice_logs.profile_id:viewer'])
})
it('exposes an unavailable state instead of fabricating a zero chart on read failure', async () => {
  results.practice_sessions = { data: null, error: { message: 'unavailable' } }
  expect(await loadPracticeWeek('viewer')).toBeNull()
})
