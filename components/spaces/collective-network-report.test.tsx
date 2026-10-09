import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const state = vi.hoisted(() => ({ result: {} as Record<string, unknown> }))
vi.mock('@/lib/collective/network-report', () => ({ readCollectiveNetworkReport: async () => state.result }))
import { CollectiveNetworkReport } from './collective-network-report'
describe('Collective owner report presentation', () => {
  it('renders nothing when report access is denied', async () => {
    state.result = { status: 'denied' }
    expect(await CollectiveNetworkReport({ spaceId: 'p', callerProfileId: 'stranger' })).toBeNull()
  })
  it('shows an unavailable message without a partial or zero money figure', async () => {
    state.result = { status: 'unavailable' }
    const html = renderToStaticMarkup(await CollectiveNetworkReport({ spaceId: 'p', callerProfileId: 'owner' }))
    expect(html).toContain('complete report'); expect(html).not.toContain('$'); expect(html).not.toContain('Net revenue')
  })
  it('labels complete net totals, exclusions and per-Space Reach links', async () => {
    state.result = { status: 'complete', spaces: [{ id: 'p', name: 'Parent', slug: 'parent' }], members: 3, events: 4, earnings: { netCents: 9500, grossCents: 10000, feeCents: 500, refundedCents: 2000 } }
    const html = renderToStaticMarkup(await CollectiveNetworkReport({ spaceId: 'p', callerProfileId: 'owner' }))
    expect(html).toContain('$95.00'); expect(html).toContain('Membership billing is not included'); expect(html).toContain('/spaces/parent/settings/reach')
  })
})
