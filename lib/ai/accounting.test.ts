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
