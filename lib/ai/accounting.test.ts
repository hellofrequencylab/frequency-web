import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ rpc: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: m.rpc }) }))
vi.mock('@/lib/log', () => ({ log: { error: m.error } }))
import { reserveAiAttempt, settleAiAttempt, holdAiAttempt } from './accounting'
beforeEach(() => { vi.resetAllMocks(); m.rpc.mockResolvedValue({ data: true, error: null }) })
it('passes all three ceilings and attribution to the atomic RPC', async () => {
  const id = await reserveAiAttempt({ feature: 'space-copilot', profileId: 'profile', spaceId: 'space', operationId: 'turn' }, 'haiku', 0.1)
  expect(m.rpc).toHaveBeenCalledWith('ai_reserve_attempt', expect.objectContaining({ p_id: id, p_operation: 'turn', p_profile: 'profile', p_space: 'space', p_global_cap: 25, p_feature_cap: 2, p_space_cap: 0.5 }))
})
it('refuses unknown features and invalid quotes before touching the database', async () => {
  for (const amount of [NaN, Infinity, -1, 0]) await expect(reserveAiAttempt({ feature: 'vera-chat' }, 'haiku', amount)).rejects.toThrow('invalid_quote')
  await expect(reserveAiAttempt({ feature: 'unregistered' }, 'haiku', 0.1)).rejects.toThrow('invalid_quote')
  expect(m.rpc).not.toHaveBeenCalled()
})
it('fails closed on rejected reservations and returned DB errors', async () => {
  m.rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: true, error: { message: 'down' } })
  await expect(reserveAiAttempt({ feature: 'vera-chat' }, 'haiku', 0.1)).rejects.toThrow('budget_or_switch')
  await expect(reserveAiAttempt({ feature: 'vera-chat' }, 'haiku', 0.1)).rejects.toThrow('reserve_failed')
  expect(m.error).toHaveBeenCalledTimes(2)
})
it('failed settlement retains and reports the reservation ID', async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } })
  await expect(settleAiAttempt('attempt', { inputTokens: 10, outputTokens: 2 }, 0.2)).rejects.toThrow('attempt')
  expect(m.rpc).toHaveBeenLastCalledWith('ai_hold_attempt', { p_id: 'attempt', p_reason: 'settle_failed' })
  expect(m.error).toHaveBeenCalledWith('ai.accounting.uncertain', { reservationId: 'attempt', reason: 'settle_failed' })
})
it('settles the cache split beside the whole prompt (PROG-E8 4b)', async () => {
  await settleAiAttempt('attempt', { inputTokens: 100, outputTokens: 9, cacheReadInputTokens: 2400, cacheCreationInputTokens: 50 }, 0.01)
  expect(m.rpc).toHaveBeenCalledTimes(1)
  expect(m.rpc).toHaveBeenCalledWith('ai_settle_attempt', { p_id: 'attempt', p_input_tokens: 2550, p_output_tokens: 9, p_actual: 0.01, p_cache_read_tokens: 2400, p_cache_creation_tokens: 50 })
})
it('a usage without cache fields records the split as not recorded (null), not zero', async () => {
  await settleAiAttempt('attempt', { inputTokens: 10, outputTokens: 2 }, 0.01)
  expect(m.rpc).toHaveBeenCalledWith('ai_settle_attempt', expect.objectContaining({ p_cache_read_tokens: null, p_cache_creation_tokens: null }))
})
it('falls back to the four-argument settle while the split migration is unapplied, and says so', async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
  await settleAiAttempt('attempt', { inputTokens: 10, outputTokens: 2, cacheReadInputTokens: 5 }, 0.01)
  expect(m.rpc).toHaveBeenCalledTimes(2)
  expect(m.rpc).toHaveBeenLastCalledWith('ai_settle_attempt', { p_id: 'attempt', p_input_tokens: 15, p_output_tokens: 2, p_actual: 0.01 })
  expect(m.error).toHaveBeenCalledWith('ai.accounting.cache_split_unavailable', { reservationId: 'attempt' })
})
it('any other settle error does not fall back: it holds', async () => {
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Invalid AI usage' } })
  await expect(settleAiAttempt('attempt', { inputTokens: 10, outputTokens: 2 }, 0.01)).rejects.toThrow('settle_failed')
  expect(m.rpc).toHaveBeenLastCalledWith('ai_hold_attempt', { p_id: 'attempt', p_reason: 'settle_failed' })
  expect(m.rpc).toHaveBeenCalledTimes(2)
})
it('invalid actual usage also retains the conservative hold', async () => {
  await expect(settleAiAttempt('attempt', { inputTokens: NaN, outputTokens: 2 }, 0.2)).rejects.toThrow('invalid_usage')
  expect(m.rpc).toHaveBeenCalledWith('ai_hold_attempt', { p_id: 'attempt', p_reason: 'settle_failed' })
})
it('reports failed hold marking without deleting or releasing the reservation', async () => {
  m.rpc.mockRejectedValue(new Error('offline'))
  await holdAiAttempt('attempt', 'stream_failed')
  expect(m.error).toHaveBeenCalledWith('ai.accounting.hold_failed', { reservationId: 'attempt' })
  expect(m.rpc).toHaveBeenCalledTimes(1)
})
