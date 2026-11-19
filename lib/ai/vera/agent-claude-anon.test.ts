import { beforeEach, expect, it, vi } from 'vitest'

// SEC-043: a signed-out visitor's Vera turn is accounted and budget-capped on its own key, so anonymous
// traffic can never spend the members' daily Vera budget down to the deterministic fallback.
const m = vi.hoisted(() => ({
  overBudget: vi.fn(async (_feature: string) => false),
  loop: vi.fn(async (_p: { accounting: { feature: string; profileId?: string | null } }) => ({ text: 'Hi there.' })),
}))
vi.mock('@/lib/ai', () => ({ aiEnabled: () => true }))
vi.mock('@/lib/ai/usage', () => ({ aiAvailable: vi.fn(async () => true), featureOverBudget: m.overBudget }))
vi.mock('@/lib/ai/rate-limit', () => ({ aiRateLimited: vi.fn(async () => false) }))
vi.mock('./usage-gate', () => ({ veraDailyCapReached: vi.fn(async () => false) }))
vi.mock('@/lib/ai/complete', () => ({ runToolLoop: m.loop }))

import { runVeraClaudeTurn } from './agent-claude'
import { FEATURE_DAILY_CAP_USD } from '@/lib/ai/budget'

beforeEach(() => vi.clearAllMocks())

it('accounts and caps a signed-out turn on the anonymous key', async () => {
  const out = await runVeraClaudeTurn({ history: [], memberText: 'hello', profileId: null, actorKey: 'ip:1.2.3.4' })
  expect(out?.reply).toBe('Hi there.')
  expect(m.overBudget).toHaveBeenCalledWith('vera-chat-anon')
  expect(m.loop.mock.calls[0][0].accounting).toEqual({ feature: 'vera-chat-anon', profileId: null })
  expect(FEATURE_DAILY_CAP_USD['vera-chat-anon']).toBeGreaterThan(0)
  expect(FEATURE_DAILY_CAP_USD['vera-chat-anon']).toBeLessThan(FEATURE_DAILY_CAP_USD['vera-chat'])
})

it('keeps a member turn on the member key', async () => {
  await runVeraClaudeTurn({ history: [], memberText: 'hello', profileId: 'p1' })
  expect(m.overBudget).toHaveBeenCalledWith('vera-chat')
  expect(m.loop.mock.calls[0][0].accounting).toEqual({ feature: 'vera-chat', profileId: 'p1' })
})

it('an exhausted anonymous budget leaves members untouched', async () => {
  m.overBudget.mockImplementation(async (f: string) => f === 'vera-chat-anon')
  expect(await runVeraClaudeTurn({ history: [], memberText: 'hi', profileId: null })).toBeNull()
  expect(await runVeraClaudeTurn({ history: [], memberText: 'hi', profileId: 'p1' })).not.toBeNull()
})
