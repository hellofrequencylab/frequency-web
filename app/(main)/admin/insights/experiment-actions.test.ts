import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({ requireAdmin: mock.guard }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mock.rpc }) }))
vi.mock('@/lib/permissions', () => ({ getCapabilityOverrides: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidate }))
import { manageGrowthExperiment } from './experiment-actions'
beforeEach(() => {
  vi.clearAllMocks()
  mock.guard.mockResolvedValue({ profileId: 'operator' })
  mock.rpc.mockResolvedValue({ error: null })
})
describe('experiment command boundary', () => {
  it.each([['invented', 'start'], ['upcoming-next-step', 'publish'], [null, 'start'], ['upcoming-next-step', { command: 'start' }]])('rejects untrusted shapes and commands before calling the RPC', async (key, command) => {
    const result = await manageGrowthExperiment(key as string, command as 'start')
    expect(result.error).toBe('Unknown experiment or command.')
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.revalidate).not.toHaveBeenCalled()
  })
  it('passes only a parsed catalog command and the authenticated actor', async () => {
    expect(await manageGrowthExperiment('upcoming-next-step', 'pause')).toEqual({})
    expect(mock.guard).toHaveBeenCalledWith('janitor', { staff: 'insights', staffLevel: 'write' })
    expect(mock.rpc).toHaveBeenCalledWith('analytics_experiment_manage', { _key: 'upcoming-next-step', _command: 'pause', _actor: 'operator' })
    expect(mock.revalidate).toHaveBeenCalledWith('/admin/insights')
  })
  it('refuses an unauthorized caller without touching storage', async () => {
    mock.guard.mockRejectedValue(new Error('denied'))
    await expect(manageGrowthExperiment('upcoming-next-step', 'start')).rejects.toThrow('denied')
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
