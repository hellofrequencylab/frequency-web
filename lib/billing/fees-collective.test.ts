import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ inherited: vi.fn(), founding: vi.fn(), waived: vi.fn() }))
vi.mock('@/lib/collective/member-spaces-store', () => ({ inheritedSpacePlan: state.inherited }))
vi.mock('@/lib/founding/status', () => ({ getFoundingStatus: state.founding }))
vi.mock('@/lib/pricing/settings', () => ({ getPricingValues: async () => ({ take_rate: {} }) }))
vi.mock('@/lib/pricing/space-allowance', () => ({ spaceLimitsWaived: state.waived }))
import { spaceNetworkBps, spaceTakeRateCents } from './fees'
beforeEach(() => { vi.clearAllMocks(); state.inherited.mockResolvedValue('business'); state.founding.mockResolvedValue(null); state.waived.mockResolvedValue(false) })
describe('fees for Collective member Spaces', () => {
  it('uses inherited Business depth instead of the stored free-plan default', async () => {
    expect(await spaceNetworkBps('free', 'child')).toBe(500)
    expect(state.inherited).toHaveBeenCalledWith('child', 'free')
    expect(await spaceTakeRateCents(10000, 'free', 'network', 'child')).toBe(500)
  })
  it('never adds a fee or reads inheritance for the Space’s own audience', async () => {
    expect(await spaceTakeRateCents(10000, 'free', 'self', 'child')).toBe(0)
    expect(state.inherited).not.toHaveBeenCalled()
  })
  it('restores the own-plan fee rung after cancellation without preserving a paid grant', async () => {
    state.inherited.mockResolvedValue('free')
    expect(await spaceNetworkBps('free', 'child')).toBe(1000)
  })
  it('a staff limits waiver lowers the fee to the waived-to plan rung (SCAN-835)', async () => {
    state.waived.mockResolvedValue(true)
    state.inherited.mockResolvedValue('free')
    expect(await spaceNetworkBps('free', 'child')).toBe(300)
    state.inherited.mockResolvedValue('business')
    expect(await spaceNetworkBps('business', 'child')).toBe(300)
  })
  it('a waiver never raises the fee: a Non Profit stays at 0', async () => {
    state.waived.mockResolvedValue(true)
    state.inherited.mockResolvedValue('nonprofit')
    expect(await spaceNetworkBps('nonprofit', 'child')).toBe(0)
  })
  it('reads the waiver only when a Space is named', async () => {
    expect(await spaceNetworkBps('free')).toBe(1000)
    expect(state.waived).not.toHaveBeenCalled()
  })
})
