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
    // ADR-1978: one finder's fee, 10% capped at $20, whatever the inherited plan.
    expect(await spaceNetworkBps('free', 'child')).toBe(1000)
    expect(state.inherited).toHaveBeenCalledWith('child', 'free')
    expect(await spaceTakeRateCents(10000, 'free', 'network', 'child')).toBe(1000)
    expect(await spaceTakeRateCents(50000, 'free', 'network', 'child')).toBe(2000)
  })
  it('never adds a fee or reads inheritance for the Space’s own audience', async () => {
    expect(await spaceTakeRateCents(10000, 'free', 'self', 'child')).toBe(0)
    expect(state.inherited).not.toHaveBeenCalled()
  })
  it('restores the own-plan fee rung after cancellation without preserving a paid grant', async () => {
    state.inherited.mockResolvedValue('free')
    expect(await spaceNetworkBps('free', 'child')).toBe(1000)
  })
  it('a staff limits waiver prices at the waived-to plan, which is the same finder’s fee (SCAN-835, ADR-1978)', async () => {
    // The waiver used to buy the Collective 3%. Every paying plan now pays one finder's fee, so the
    // waived-to plan's rate is that fee: the waiver still never raises a rate.
    state.waived.mockResolvedValue(true)
    state.inherited.mockResolvedValue('free')
    expect(await spaceNetworkBps('free', 'child')).toBe(1000)
    state.inherited.mockResolvedValue('business')
    expect(await spaceNetworkBps('business', 'child')).toBe(1000)
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
