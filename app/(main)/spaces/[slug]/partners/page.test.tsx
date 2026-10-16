import { beforeEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
const mocks = vi.hoisted(() => ({ caller: vi.fn(), hub: vi.fn(), view: vi.fn(), events: vi.fn(), hero: vi.fn() }))
vi.mock('@/lib/layout/index-hero', () => ({ resolveIndexHero: mocks.hero }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.caller }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: mocks.hub }))
vi.mock('@/lib/spaces/profile-metadata', () => ({ spaceProfileMetadata: vi.fn() }))
vi.mock('@/lib/collective/partners-store', () => ({ loadPartnersView: mocks.view, loadPartnersCalendarWindow: mocks.events }))
vi.mock('./actions', () => ({ loadPartnersMonth: vi.fn() }))
vi.mock('./partners-manager', () => ({ PartnersManager: () => <div>Send invite</div> }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('@/components/templates', () => ({ IndexTemplate: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/events/event-calendar', () => ({ EventCalendar: () => <div>Calendar</div> }))
vi.mock('@/components/spaces/brand-anchor', () => ({ BrandAnchor: () => null }))
const { default: Page } = await import('./page')
const hub = { id: 'hub', slug: 'hub', name: 'Hub', status: 'active', plan: 'collective', networkConnected: true, ownerProfileId: 'owner', type: 'business' }
const view = {
  hubId: 'hub', hubName: 'Hub', slotsLeft: 9, names: { hub: 'Hub', p1: 'Partner One' },
  partners: [{ id: 'p1', slug: 'partner-one', name: 'Partner One', logoUrl: null, partnershipId: 'r1', listings: [{ kind: 'circle', id: 'c1', slug: 'morning-run', label: 'Morning Run', sourceSpaceId: 'p1', targetSpaceId: 'hub' }] }],
  pending: [{ id: 'p2', slug: 'invited', name: 'Invited Space', logoUrl: null, partnershipId: 'r2', listings: [] }],
  listings: [{ kind: 'circle', id: 'c1', slug: 'morning-run', label: 'Morning Run', sourceSpaceId: 'p1', targetSpaceId: 'hub' }],
}
const render = async () => renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: 'hub' }) }))
beforeEach(() => { vi.clearAllMocks(); mocks.hero.mockResolvedValue({}); mocks.caller.mockResolvedValue(null); mocks.hub.mockResolvedValue(hub); mocks.view.mockResolvedValue(view); mocks.events.mockResolvedValue([]) })

it('renders the partner directory, what partners share, and the shared calendar to a visitor', async () => {
  const markup = await render()
  expect(markup).toContain('/spaces/partner-one')
  expect(markup).toContain('/circles/morning-run')
  expect(markup).toContain('From Partner One, listed with Hub')
  expect(markup).toContain('Shared calendar')
  expect(markup).not.toContain('Send invite')
  expect(markup).not.toContain('Invited Space')
})
it('gives the hub owner the invite controls', async () => {
  mocks.caller.mockResolvedValue({ id: 'owner' })
  expect(await render()).toContain('Send invite')
})
it('is not found on a Network or any non-Collective plan, so a Space never shows both tabs', async () => {
  for (const plan of ['network', 'business']) {
    mocks.hub.mockResolvedValue({ ...hub, plan })
    await expect(render()).rejects.toThrow('NOT_FOUND')
  }
  expect(mocks.view).not.toHaveBeenCalled()
})
