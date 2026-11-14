import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  caller: { id: 'author-id' } as { id: string } | null,
  allowed: true,
  readFail: null as null | 'phases' | 'children',
  writes: [] as Array<{ table: string; value: Record<string, unknown> }>,
  inserts: vi.fn(),
  existing: { id: 'published-step', required: true, body: 'The author wrote this.' },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => state.caller }))
vi.mock('@/lib/journey-plans', () => ({ getPlan: async () => ({ plan: { id: 'plan-id', author_id: 'author-id' }, items: [state.existing] }) }))
vi.mock('@/lib/journeys/authoring', () => ({ canEditJourney: async () => state.allowed }))
vi.mock('@/lib/practices', () => ({ createPractice: vi.fn() }))
vi.mock('@/lib/pillars', () => ({ getPillars: vi.fn() }))
vi.mock('@/lib/seasons', () => ({ getCurrentSeason: vi.fn() }))
vi.mock('@/lib/ai/journey-slot-coaching', () => ({ draftSlotCoaching: vi.fn() }))
vi.mock('@/lib/ai/journey-edit', () => ({ planJourneyEdits: vi.fn() }))
vi.mock('@/lib/journeys/portable', () => ({ toPortable: vi.fn() }))
vi.mock('@/lib/journeys/compose', async () => {
  const { extraCreditRow } = await import('@/lib/journeys/extra-credit')
  return {
    composeIntoPhase: vi.fn(),
    pillarIdsBySlug: async () => ({ mind: 'mind-id', body: 'body-id', spirit: 'spirit-id', expression: 'expression-id' }),
    insertChildren: state.inserts,
    extraCreditRow,
    EXTRA_CREDIT_PLACEHOLDER: { title: 'Extra credit', body: 'Optional.' },
  }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const filters = new Map<string, unknown>()
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.set(key, value); return query },
    is: () => query,
    order: () => query,
    limit: () => query,
    // No update/delete method: an attempt to modify existing lessons fails the test immediately.
    insert: (value: Record<string, unknown>) => { state.writes.push({ table, value }); return query },
    maybeSingle: async () => ({ data: { id: 'new-phase-id' }, error: null }),
    then: (resolve: (value: unknown) => unknown) => {
      const childRead = filters.has('parent_id')
      const refuse = state.readFail === (childRead ? 'children' : 'phases')
      return resolve({ data: refuse ? null : [{ id: 'existing-phase', sort_order: 0 }], count: refuse ? null : childRead ? 1 : null, error: refuse ? { message: 'Read refused' } : null })
    },
  }
  return query
} }) }))

import { scaffoldJourneyAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  state.caller = { id: 'author-id' }
  state.allowed = true
  state.readFail = null
  state.writes.length = 0
})

describe('actual manual Journey scaffold boundary', () => {
  it('inserts optional suggestions into a new phase without changing existing authored requirements', async () => {
    const before = structuredClone(state.existing)
    expect(await scaffoldJourneyAction('my-journey')).toEqual({ data: { phaseId: 'new-phase-id' } })
    expect(state.writes).toEqual([{ table: 'journey_plan_items', value: { plan_id: 'plan-id', block_type: 'phase', parent_id: null, title: 'Your first week', sort_order: 1, required: true } }])
    const [admin, planId, phaseId, rows] = state.inserts.mock.calls[0]
    expect(admin).toBeDefined()
    expect(planId).toBe('plan-id')
    expect(phaseId).toBe('new-phase-id')
    expect(rows.filter((row: { required: boolean }) => row.required)).toHaveLength(1)
    expect(rows.find((row: { domain_id: string }) => row.domain_id === 'expression-id')).toMatchObject({ required: false, settings: { extra_credit: true, bonus_zaps: 25 } })
    expect(state.existing).toEqual(before)
  })
  it.each(['phases', 'children'] as const)('refuses an unavailable %s read instead of treating it as an empty phase', async (kind) => {
    state.readFail = kind
    expect(await scaffoldJourneyAction('my-journey')).toEqual({ error: 'Could not start the journey shape.' })
    expect(state.writes).toEqual([])
    expect(state.inserts).not.toHaveBeenCalled()
  })
  it.each(['signed-out', 'unauthorized'])('refuses %s callers before reading or inserting suggested content', async (kind) => {
    if (kind === 'signed-out') state.caller = null
    else state.allowed = false
    expect(await scaffoldJourneyAction('my-journey')).toEqual({ error: 'Only the author can edit this journey.' })
    expect(state.writes).toEqual([])
    expect(state.inserts).not.toHaveBeenCalled()
  })
})
