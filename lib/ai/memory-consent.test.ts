import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  consent: new Map<string, boolean>(), error: false, thrown: false, revokeAfterRead: false, viewer: 'allowed',
  reads: [] as string[], writes: [] as { kind: string; value: unknown }[],
  contexts: [] as Record<string, unknown>[], live: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from(table: string) {
    let id = ''
    const query = {
      select() { return query }, eq(key: string, value: string) { if (key === 'profile_id') id = value; return query },
      order() { return query }, limit() { return query },
      async maybeSingle() {
        if (table === 'consent_records') {
          if (state.thrown) throw new Error('inert consent failure')
          return { data: state.consent.has(id) ? { granted: state.consent.get(id) } : null, error: state.error ? { message: 'inert error' } : null }
        }
        state.reads.push(id)
        if (state.revokeAfterRead) state.consent.set(id, false)
        return { data: state.contexts.find(row => row.profile_id === id) ?? null, error: null }
      },
      upsert(value: unknown) { state.writes.push({ kind: 'upsert', value }); return Promise.resolve({ error: null }) },
      update(value: unknown) { state.writes.push({ kind: 'update', value }); return query },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: state.contexts, error: null }).then(resolve) },
    }
    return query
  },
}) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'auth-inert' } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
    id: state.viewer, community_role: 'member', web_role: 'none', membership_tier: 'free',
    meta: { persona: 'practitioner' },
  } }) }) }) }),
}) }))
vi.mock('@/lib/ai', () => ({ aiEnabled: () => true }))
vi.mock('@/lib/ai/client', () => ({ aiEnabled: () => false }))
vi.mock('@/lib/ai/complete', () => ({ completeRaw: vi.fn(() => { throw new Error('Provider must not run') }) }))
vi.mock('@/lib/ai/usage', () => ({ aiAvailable: async () => false, featureOverBudget: async () => false }))
vi.mock('@/lib/support/store', () => ({ supportSummaryForVera: async () => '' }))
vi.mock('@/lib/ai/vera/loop', () => ({ runVeraTurn: vi.fn() }))
vi.mock('@/lib/ai/vera/agent-claude', () => ({ runVeraClaudeTurn: state.live }))

import { hasConsent } from '@/lib/consent/consent'
import { getMemberContext, rememberFacts, claimMembersDueForSummary, writeDigest } from './memory'
import { summarizeVeraMemory } from './memory-summary'
import { runConciergeTurn } from './vera/turn'

beforeEach(() => {
  state.consent = new Map([['allowed', true], ['denied', false]])
  state.error = false; state.thrown = false; state.revokeAfterRead = false; state.viewer = 'allowed'
  state.reads = []; state.writes = []
  state.contexts = ['allowed', 'denied'].map(profile_id => ({ profile_id,
    facts: { interests: Array.from({ length: 30 }, (_, i) => `Interest ${i}`) },
    summary: 'Saved context', milestones: {}, interaction_count: 50, last_summarized_at: null,
  }))
  state.live.mockReset().mockResolvedValue({ reply: 'Inert reply', proposals: [], suggestions: [] })
})

describe('actual persistent memory honors the consent ledger without erasing data', () => {
  it('denies saved-context reads before querying member context', async () => {
    expect(await getMemberContext('denied')).toBeNull()
    expect(state.reads).toEqual([])
    expect(state.contexts).toHaveLength(2)
  })
  it('keeps allowed saved-context reads and same-input fact merging', async () => {
    expect((await getMemberContext('allowed'))?.summary).toBe('Saved context')
    await rememberFacts('allowed', { goals: ['A new goal'] })
    expect(state.writes).toHaveLength(1)
    expect(state.writes[0].value).toMatchObject({ profile_id: 'allowed', facts: { goals: ['A new goal'] } })
  })
  it('denies new remembered facts without reading or writing persistent context', async () => {
    await rememberFacts('denied', { goals: ['Do not save'] })
    expect(state.reads).toEqual([])
    expect(state.writes).toEqual([])
  })
  it('rechecks memory consent after the awaited existing-context read', async () => {
    state.revokeAfterRead = true
    await rememberFacts('allowed', { goals: ['Do not persist after revocation'] })
    expect(state.reads).toEqual(['allowed'])
    expect(state.writes).toEqual([])
  })
  it('filters denied summary candidates before compression can receive their facts', async () => {
    expect((await claimMembersDueForSummary(20)).map(row => row.profileId)).toEqual(['allowed'])
    const result = await summarizeVeraMemory({ limit: 20 })
    expect(result.scanned).toBe(1)
    expect(result.compressed).toBe(1)
    expect(state.writes).toHaveLength(1)
  })
  it('rechecks consent before digest writes when it changes after selection', async () => {
    const selected = await claimMembersDueForSummary(20)
    expect(selected[0].profileId).toBe('allowed')
    state.consent.set('allowed', false)
    await writeDigest('allowed', { summary: 'Do not persist', facts: {} })
    expect(state.writes).toEqual([])
  })
  it('retains a true default only for a successful no-record consent read', async () => {
    expect(await hasConsent('no-record', 'ai_memory')).toBe(true)
    expect(await hasConsent('denied', 'ai_memory')).toBe(false)
    expect(await hasConsent('allowed', 'ai_memory')).toBe(true)
  })
  it('fails closed on a returned consent error even when the scope default is true', async () => {
    state.error = true
    expect(await hasConsent('no-record', 'ai_memory')).toBe(false)
    expect(await getMemberContext('allowed')).toBeNull()
    await rememberFacts('allowed', { goals: ['No write'] })
    expect(await claimMembersDueForSummary(20)).toEqual([])
    expect(state.writes).toEqual([])
  })
  it('fails closed on thrown consent errors', async () => {
    state.thrown = true
    expect(await hasConsent('allowed', 'ai_memory')).toBe(false)
    expect(await getMemberContext('allowed')).toBeNull()
  })
  for (const viewer of ['allowed', 'denied']) it(`${viewer}: preserves explicit current conversation and profile context`, async () => {
    state.viewer = viewer
    const history = [{ role: 'user' as const, text: 'Explicit current conversation' }]
    await runConciergeTurn('chat', 'Current request', history)
    expect(state.live).toHaveBeenCalledOnce()
    const input = state.live.mock.calls[0][0]
    expect(input.history).toEqual(history)
    expect(input.reader).toEqual({ persona: 'practitioner', archetype: null })
    expect(input.memberContext === null).toBe(viewer === 'denied')
    expect(state.contexts).toHaveLength(2)
  })
})
