import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpaceLanding } from './space-landing'

vi.mock('@/lib/auth', () => ({ getMyProfileId: vi.fn(async () => null) }))
vi.mock('@/lib/spaces/store', () => ({ getVisibleSpaceBySlug: vi.fn(async () => ({ id: 'group-id', slug: 'the-group', name: 'The Group', type: 'collective', preferences: {} })) }))
vi.mock('@/lib/spaces/active-space', () => ({ setActiveSpace: vi.fn() }))
vi.mock('@/lib/spaces/page-doc', () => ({ loadSpacePageDoc: vi.fn(async () => ({ root: {}, content: [{ type: 'NetworkCircles', props: { id: 'circles', circles: [{ title: 'Coaches Club', circleSlug: 'tg-coaches-club', match: 'Coaches Club' }] } }] })) }))
vi.mock('@/lib/spaces/content-data', () => ({
  getSpaceReviews: vi.fn(async () => ({ average: null, count: 0 })),
  getSpaceContentData: vi.fn(async () => ({ community: [], events: [{ id: 'next', slug: 'coaches-next', title: 'Coaches Club', startsAt: '2099-10-20T09:30:00Z' }] })),
  getSpaceSeriesRows: vi.fn(async () => []),
}))
vi.mock('@/lib/spaces/team-picks', () => ({ resolveTeamPicksForDoc: vi.fn(async () => undefined) }))
vi.mock('@/components/spaces/network-page-scope', () => ({ NetworkPageScope: ({ children }: { children: React.ReactNode }) => children }))

const siteLinks = { origin: 'https://frequency.example', slug: 'the-group', siteBase: '/sites/the-group', pages: ['home'], contactHref: null, bookHref: null, email: null }

describe('legacy Space website link metadata', () => {
  it('opens actual Frequency circle and event routes from an external site', async () => {
    const html = renderToStaticMarkup(await SpaceLanding({ slug: 'the-group', anonymous: true, site: true, siteLinks }))
    expect(html).toContain('href="https://frequency.example/circles/tg-coaches-club"')
    expect(html).toContain('href="https://frequency.example/events/coaches-next"')
  })

  it('keeps in-app Space circle and event links relative', async () => {
    const html = renderToStaticMarkup(await SpaceLanding({ slug: 'the-group' }))
    expect(html).toContain('href="/circles/tg-coaches-club"')
    expect(html).toContain('href="/events/coaches-next"')
    expect(html).not.toContain('https://frequency.example')
  })
})
