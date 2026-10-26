import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ model: vi.fn(), system: true, memberships: ['circle-A', 'circle-A', 'circle-B'] as (string | null)[], inserts: [] as Record<string, unknown>[], reads: [] as { table: string; filters: [string, unknown][] }[], failCircle: null as string | null }))
vi.mock('@/lib/ai/complete', () => ({ completeText: state.model, AiUnavailableError: class extends Error {} }))
vi.mock('@/lib/ai/usage', () => ({ aiAvailable: async () => true, featureOverBudget: async () => false }))
vi.mock('@/lib/ai/voice', () => ({ withVoice: (s: string) => s }))
vi.mock('@/lib/blocking', () => ({ isBlockedBetween: async () => false }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const filters: [string, unknown][] = []
  state.reads.push({ table, filters })
  const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q }, limit: () => q,
    maybeSingle: async () => ({ data: state.system ? { id: 'SYSTEM' } : null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: state.memberships.map(circle_id => ({ circle_id })) }).then(resolve),
    insert: async (payload: Record<string, unknown>) => { state.inserts.push(payload); return { error: payload.scope_id === state.failCircle ? new Error('write failed') : null } },
  }
  return q
} }) }))
import { celebrateInCircleFeed, deterministicCelebration } from './social-fuel'
beforeEach(() => { state.model.mockReset().mockResolvedValue({ text: '@member MODEL-GENERATED PUBLIC COPY' }); state.system = true; state.memberships = ['circle-A', 'circle-A', 'circle-B']; state.inserts = []; state.reads = []; state.failCircle = null })
describe('system milestone recognition authorship', () => {
  it('persists only the existing human-written template, as SYSTEM, in deduplicated active member Circles', async () => {
    const context = { handle: 'member', kind: 'journey_finished' as const, detail: 'Morning' }
    expect(await celebrateInCircleFeed('member-profile', context)).toBe(2)
    expect(state.inserts).toEqual(['circle-A', 'circle-B'].map(scope_id => ({ author_id: 'SYSTEM', scope_id, visibility: 'group', post_type: 'system', body: deterministicCelebration(context) })))
    expect(state.model).not.toHaveBeenCalled()
    expect(state.reads.find(r => r.table === 'profiles')?.filters).toEqual([['is_system', true], ['is_active', true]])
    expect(state.reads.find(r => r.table === 'memberships')?.filters).toEqual([['profile_id', 'member-profile'], ['status', 'active']])
  })
  it('retains Master recognition and partial-write behavior without calling a model', async () => {
    state.failCircle = 'circle-A'
    expect(await celebrateInCircleFeed('member-profile', { handle: 'member', kind: 'master_rank' })).toBe(1)
    expect(state.inserts[1].body).toBe('@member reached Master this season. Worth a hello at the next Circle.')
    expect(state.model).not.toHaveBeenCalled()
  })
  it('never falls back to the member as author when the system account is unavailable', async () => {
    state.system = false
    expect(await celebrateInCircleFeed('member-profile', { handle: 'member', kind: 'master_rank' })).toBe(0)
    expect(state.inserts).toEqual([])
    expect(state.model).not.toHaveBeenCalled()
  })
  it('does not publish elsewhere for a member without an active Circle', async () => {
    state.memberships = [null]
    expect(await celebrateInCircleFeed('member-profile', { handle: 'member', kind: 'master_rank' })).toBe(0)
    expect(state.inserts).toEqual([])
    expect(state.model).not.toHaveBeenCalled()
  })
})
