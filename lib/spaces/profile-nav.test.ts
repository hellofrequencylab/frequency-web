import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Space } from '@/lib/spaces/types'

// THE CIRCLES TAB GATE (ADR-1094), and the honest-empty rule it follows.
//
// The owner's call: hide the tab at zero, the same way Calendar, Collaborators and Shop are hidden
// until there is something behind them, with ONE exception — a manager keeps it, because the empty
// state is where "Start your first circle" lives.
//
// The gate reads `presence.circles`, which is the SAME request-cached read the Home teaser block
// renders from, so the menu and the page can never disagree about whether a visitor would find
// anything. These tests pin that pairing, plus the two things that used to be wrong: the tab was an
// ANCHOR into Home rather than a page, and the anchor now has to be suppressed or it sits in the
// menu twice (the "two Reviews" bug, a second time).

const presence = {
  booking: false,
  events: false,
  reviews: false,
  faqs: false,
  practices: false,
  circles: false,
}
const manage = { canManage: false, staffViewing: false }

vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'p1', webRole: null }) }))
// Partial: `spaceFunctionEnabled` reads the REAL `spaceEntitlements` from this module, and using
// the real resolver is the point — it means the function-off test exercises the actual gate.
vi.mock('@/lib/spaces/entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/spaces/entitlements')>()),
  resolveSpaceManageAccess: async () => manage,
}))
vi.mock('@/lib/spaces/content-data', () => ({ getSpaceSectionPresence: async () => presence }))
vi.mock('@/lib/events/store', () => ({ spaceHasPublicUpcomingEvents: async () => false }))
vi.mock('@/lib/spaces/collaborations', () => ({ spaceHasCollaborators: async () => false }))

import { buildSpaceProfileNav } from './profile-nav'

/** A Space with a Home doc that DOES carry the Circles block, so the anchor would be derived if it
 *  were not suppressed. `entitlements` is left empty: an absent key means the function is ON. */
function space(over: Partial<Space> = {}): Space {
  return {
    id: 's1',
    slug: 'ojai',
    name: 'Ojai Yoga',
    brandName: 'Ojai Yoga',
    type: 'business',
    entitlements: {},
    preferences: {
      pages: [
        {
          slug: 'home',
          label: 'Home',
          doc: { content: [{ type: 'SpaceCommunity', props: { id: 'x' } }], root: {} },
        },
      ],
    },
    ...over,
  } as unknown as Space
}

const labels = (tabs: { label: string }[]) => tabs.map((t) => t.label)
const hrefFor = (tabs: { label: string; href: string }[], label: string) =>
  tabs.find((t) => t.label === label)?.href

beforeEach(() => {
  presence.circles = false
  manage.canManage = false
  manage.staffViewing = false
})

describe('the Circles tab', () => {
  it('HIDE AT ZERO: a visitor is never offered a tab over an empty page', async () => {
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).not.toContain('Circles')
  })

  it('shows once the Space has a circle the viewer could actually open', async () => {
    presence.circles = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).toContain('Circles')
  })

  it('is a real PAGE, not the old #circles anchor into Home', async () => {
    presence.circles = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(hrefFor(tabs, 'Circles')).toBe('/spaces/ojai/circles')
  })

  it('and the Home anchor is suppressed, so Circles never appears in the menu twice', async () => {
    presence.circles = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs).filter((l) => l === 'Circles')).toHaveLength(1)
    expect(tabs.filter((t) => t.href.includes('#circles'))).toHaveLength(0)
  })

  it('a MANAGER keeps it at zero: the empty state is where "Start your first circle" lives', async () => {
    manage.canManage = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).toContain('Circles')
  })

  it('a staff previewer sees it too, so a Space reads as its owner would', async () => {
    manage.staffViewing = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).toContain('Circles')
  })

  it('the `circles` FUNCTION being switched off hides it from everyone, manager included', async () => {
    presence.circles = true
    manage.canManage = true
    const { tabs } = await buildSpaceProfileNav(space({ entitlements: { circles: false } as unknown as Space['entitlements'] }))
    expect(labels(tabs)).not.toContain('Circles')
  })

  it('ROOT never offers it: every personal circle on the platform is stamped to that tenant', async () => {
    presence.circles = true
    manage.canManage = true
    const { tabs } = await buildSpaceProfileNav(space({ type: 'root' }))
    expect(labels(tabs)).not.toContain('Circles')
  })
})
