import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'
import type { Space } from '@/lib/spaces/types'

// ─────────────────────────────────────────────────────────────────────────────
// THE SHARE URL'S MENU MUST NOT COST IT ITS ISR (LIVE-522).
//
// `/spaces/<slug>` serves the (public) ISR body to every signed-out visitor and
// every crawler. A single cookies() read anywhere beneath it makes the route
// dynamic, and ADR-1465 / ADR-1526 exist to protect exactly that.
//
// So this file does not ASSERT the absence of a cookie read by grepping for one.
// It makes `getCallerProfile` THROW, and then asks for the public menu. If any
// reader on that path touches the caller — today or in two years — this test
// fails by name instead of the share URL quietly losing its cache.
//
// The first assertion below is the CONTROL, and it is load-bearing: it proves
// the throwing mock is really wired in. Without it, a mock that silently failed
// to apply would make every other case pass for the wrong reason.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/auth', () => ({
  getCallerProfile: async () => {
    throw new Error('getCallerProfile was called on the anonymous path')
  },
  getMyProfileId: async () => {
    throw new Error('getMyProfileId was called on the anonymous path')
  },
}))

const presence = {
  booking: false,
  events: true,
  reviews: false,
  faqs: true,
  practices: false,
  circles: false,
  about: false,
  team: false,
  highlights: false,
}

vi.mock('@/lib/spaces/entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/spaces/entitlements')>()),
  resolveSpaceManageAccess: async () => ({ canManage: false, staffViewing: false }),
}))
vi.mock('@/lib/spaces/content-data', () => ({ getSpaceSectionPresence: async () => presence }))
vi.mock('@/lib/events/store', () => ({ spaceHasPublicUpcomingEvents: async () => true }))
vi.mock('@/lib/spaces/collaborations', () => ({ spaceHasCollaborators: async () => false }))
// 🔴 DELIBERATELY TRUE. This reader calls getCallerProfile INTERNALLY, so the anonymous path must
// never reach it. Returning true here means: if the public build ever calls it, a People tab
// appears and the assertion below catches it. A `false` mock would hide exactly that regression.
vi.mock('@/lib/spaces/member-directory', () => ({ viewerCanSeeSpaceMemberDirectory: async () => true }))
vi.mock('@/lib/spaces/memberships', () => ({ spaceHasActiveMembershipTiers: async () => false }))
vi.mock('@/lib/spaces/space-discussion', () => ({
  getLiveSpaceCircle: async () => null,
  canSeeSpaceDiscussionTab: () => false,
}))

const { buildPublicSpaceProfileNav, buildSpaceProfileNav } = await import('@/lib/spaces/profile-nav')

const space = (over: Partial<Space> = {}): Space =>
  ({
    id: 's1',
    slug: 'royaltemple',
    name: 'Royal Temple',
    type: 'business',
    preferences: { profileLayout: { rows: [{ id: 'r1', columns: 1, cells: [['faq']] }] } },
    ...over,
  }) as unknown as Space

describe('the signed-out share URL builds a menu without reading a cookie', () => {
  it('CONTROL: the member path does read the caller, so the throwing mock is really wired', async () => {
    await expect(buildSpaceProfileNav(space())).rejects.toThrow('getCallerProfile')
  })

  it('the public path resolves a menu anyway', async () => {
    const { tabs } = await buildPublicSpaceProfileNav(space())
    expect(tabs.length).toBeGreaterThan(0)
    expect(tabs[0]?.href).toBe('/spaces/royaltemple')
  })

  it('still derives the section anchors of the page that renders', async () => {
    const { tabs } = await buildPublicSpaceProfileNav(space())
    // 🔴 `#faq`, NOT `#events`, and the swap is the point. LIVE-520 (#2916) added `events` to
    // DEDICATED_TAB_ANCHORS, because Calendar is a real tab and an `#events` anchor beside it is
    // the "two Reviews" bug again. A suppressed anchor can never appear here, so asserting it
    // would fail for a reason that has nothing to do with the anonymous path this file guards.
    // `faq` is not in any starter layout either, so it can ONLY have come from the fixture's own
    // profileLayout above -- which is what makes this an anchor-derivation check at all. The
    // sibling profile-nav.test.ts moved to `faq` for the same reason and records the measurement.
    expect(tabs.map((t) => t.href)).toContain('/spaces/royaltemple#faq')
  })

  it('offers the visitor the doors a visitor can use', async () => {
    const { tabs } = await buildPublicSpaceProfileNav(space())
    expect(tabs.map((t) => t.label)).toContain('Calendar')
  })

  it('never offers People, even though the directory reader would say yes', async () => {
    // The mock above returns TRUE. A public build that reached it would both add the tab AND
    // throw on the caller read inside it, so this pins the short-circuit rather than the answer.
    const { tabs } = await buildPublicSpaceProfileNav(space())
    expect(tabs.map((t) => t.label)).not.toContain('People')
  })

  it('gives a visitor no operator links', async () => {
    const { adminTabs } = await buildPublicSpaceProfileNav(space())
    expect(adminTabs).toEqual([])
  })
})

describe('the menu the share URL mounts can survive a static prerender', () => {
  // 🔴 THIS COST A BUILD. Mounting the client `SpaceProfileMenu` here failed the Vercel build on
  // /spaces/encinitas-nexus with "useSearchParams() should be wrapped in a suspense boundary at page
  // /spaces/[slug]". A <Suspense> wrapper is the documented remedy and the wrong one: a bailed-out
  // subtree is not in the prerendered HTML, so the build would pass while the Space's own navigation
  // vanished from the page crawlers read. The view is hook-free instead.
  const view = readFileSync('components/spaces/space-profile-menu-view.tsx', 'utf8')
  const page = readFileSync('app/(public)/spaces/[slug]/page.tsx', 'utf8')
  const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('the view reads no router hooks', () => {
    for (const hook of ['useSearchParams', 'usePathname']) {
      expect(code(view), hook).not.toContain(hook)
    }
  })

  it('the view is not pinned to the client bundle', () => {
    expect(view.trimStart().startsWith("'use client'")).toBe(false)
  })

  it('the prerendered page mounts the view, not the hook-reading wrapper', () => {
    const pc = code(page)
    expect(pc).toContain('SpaceProfileMenuView')
    expect(pc).not.toMatch(/<SpaceProfileMenu[\s/>]/)
  })
})

// LIVE-764: adding the public Collective door must preserve the anonymous cache boundary.
describe('Collective network navigation', () => {
  it('shows the Network door only for an active connected Collective', async () => {
    const collective = { plan: 'collective', status: 'active', networkConnected: true, ownerProfileId: 'owner' } as Partial<Space>
    expect((await buildPublicSpaceProfileNav(space(collective))).tabs).toContainEqual({ href: '/spaces/royaltemple/network', label: 'Network' })
    for (const change of [{ plan: 'business' }, { status: 'suspended' }, { networkConnected: false }]) {
      expect((await buildPublicSpaceProfileNav(space({ ...collective, ...change } as Partial<Space>))).tabs.some(tab => tab.label === 'Network')).toBe(false)
    }
  })
})
