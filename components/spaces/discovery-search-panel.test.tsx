import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
const actions = vi.hoisted(() => ({ start: vi.fn(), disconnect: vi.fn(), review: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/settings/coach/search-actions', () => ({ startSearchProvider: actions.start, disconnectSearchProvider: actions.disconnect, reviewConnectedSearch: actions.review }))
import { DiscoverySearchPanel } from './discovery-search-panel'
beforeEach(() => vi.clearAllMocks())
const provider = { provider: 'google' as const, configured: true, status: null }
describe('owner search connection controls', () => {
  it('shows explicit setup and consent limits without calling providers on render', () => {
    const html = renderToStaticMarkup(<DiscoverySearchPanel spaceId="space-a" allowed={false} providers={[{ ...provider, configured: false }]} />)
    expect(html).toContain('Account setup is needed'); expect(html).toContain('Allow discovery coaching above')
    expect(html).toContain('Not connected.'); expect(html).toContain('disabled=""'); expect(html).toContain('You write the content.')
    expect(actions.start).not.toHaveBeenCalled(); expect(actions.review).not.toHaveBeenCalled(); expect(actions.disconnect).not.toHaveBeenCalled()
  })
  it('offers forgetting connected credentials even when coaching consent is off', () => {
    const html = renderToStaticMarkup(<DiscoverySearchPanel spaceId="space-a" allowed={false} providers={[{ ...provider, status: { state: 'connected', propertyUrl: 'https://example.com/', expiresAt: null } }]} />)
    expect(html).toContain('Connected to https://example.com/'); expect(html).toContain('Forget connection')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Review search evidence/)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Forget connection/)
  })
  it('explains separate dedicated Bing scope and never implies live citations or conversions', () => {
    const html = renderToStaticMarkup(<DiscoverySearchPanel spaceId="space-a" allowed providers={[{ provider: 'bing', configured: true, status: null }]} />)
    expect(html).toContain('Bing requires a dedicated website property'); expect(html).toContain('shared Frequency-wide statistics are excluded')
    expect(html).toContain('do not prove enquiries, attendance, rankings in AI answers or conversions')
    expect(html).not.toContain('accessToken'); expect(html).not.toContain('refreshToken')
  })
})
