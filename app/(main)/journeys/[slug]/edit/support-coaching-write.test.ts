import { beforeEach, describe, expect, it, vi } from 'vitest'
import { automaticallyAdoptsPractice } from '@/lib/journeys/leg-targets'
const state = vi.hoisted(() => ({
  allowed: true,
  target: { block_type: 'practice', settings: { support_suggestion: true, fixed: true, warmup: true } } as { block_type: string; settings: Record<string, unknown> } | null,
  readError: false,
  filters: [] as Array<[string, unknown]>,
  writes: [] as Array<Record<string, unknown>>,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'author' }) }))
vi.mock('@/lib/journey-plans', () => ({ getPlan: async () => ({ plan: { id: 'plan', author_id: 'author' }, items: [] }) }))
vi.mock('@/lib/journeys/authoring', () => ({ canEditJourney: async () => state.allowed }))
vi.mock('@/lib/practices', () => ({ createPractice: vi.fn() }))
vi.mock('@/lib/pillars', () => ({ getPillars: vi.fn() }))
vi.mock('@/lib/seasons', () => ({ getCurrentSeason: vi.fn() }))
vi.mock('@/lib/ai/journey-slot-coaching', () => ({ draftSlotCoaching: vi.fn() }))
vi.mock('@/lib/ai/journey-edit', () => ({ planJourneyEdits: vi.fn() }))
vi.mock('@/lib/journeys/portable', () => ({ toPortable: vi.fn() }))
vi.mock('@/lib/journeys/compose', () => ({ composeIntoPhase: vi.fn(), pillarIdsBySlug: vi.fn(), insertChildren: vi.fn(), extraCreditRow: vi.fn(), EXTRA_CREDIT_PLACEHOLDER: {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from() {
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { state.filters.push([key, value]); return query },
    maybeSingle: async () => ({ data: state.target, error: state.readError ? { message: 'Read unavailable' } : null }),
    update: (value: Record<string, unknown>) => { state.writes.push(value); return query },
    then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
  }
  return query
} }) }))
import { updateBlockAction } from './actions'
beforeEach(() => {
  vi.clearAllMocks()
  state.allowed = true
  state.readError = false
  state.target = { block_type: 'practice', settings: { support_suggestion: true, fixed: true, warmup: true } }
  state.filters.length = 0
  state.writes.length = 0
})

describe('actual practice coaching save preserves support commitment metadata', () => {
  it('keeps a new suggestion optional through the real editor save', async () => {
    expect(await updateBlockAction('slug', 'item', { coachingPrompt: 'Try what fits.' })).toEqual({ data: undefined })
    expect(state.writes).toEqual([{ settings: { support_suggestion: true, fixed: true, warmup: true, coaching_prompt: 'Try what fits.' } }])
    expect(automaticallyAdoptsPractice({ required: false, settings: state.writes[0].settings as never })).toBe(false)
    expect(state.filters).toEqual([['id', 'item'], ['plan_id', 'plan'], ['id', 'item'], ['plan_id', 'plan']])
  })
  it('keeps an explicit Anchor and the existing bounded coaching value', async () => {
    state.target!.settings.anchor = true
    await updateBlockAction('slug', 'item', { coachingPrompt: 'x'.repeat(400) })
    const settings = state.writes[0].settings as { anchor: boolean; coaching_prompt: string; support_suggestion: boolean }
    expect(settings.anchor).toBe(true)
    expect(settings.coaching_prompt).toHaveLength(300)
    expect(automaticallyAdoptsPractice({ required: false, settings })).toBe(true)
  })
  it.each(['denied', 'missing', 'unavailable', 'wrong-kind'])('makes no write for %s metadata', async (kind) => {
    if (kind === 'denied') state.allowed = false
    if (kind === 'missing') state.target = null
    if (kind === 'unavailable') state.readError = true
    if (kind === 'wrong-kind') state.target!.block_type = 'lesson'
    expect(await updateBlockAction('slug', 'item', { coachingPrompt: 'New prompt' })).toHaveProperty('error')
    expect(state.writes).toEqual([])
  })
})
