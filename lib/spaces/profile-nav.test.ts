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
let showPeople = false
vi.mock('@/lib/spaces/member-directory', () => ({
  viewerCanSeeSpaceMemberDirectory: async () => showPeople,
}))

let hasTiers = false
vi.mock('@/lib/spaces/memberships', () => ({
  spaceHasActiveMembershipTiers: async () => hasTiers,
}))

const hub = { live: false }
vi.mock('@/lib/spaces/space-discussion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./space-discussion')>()),
  getLiveSpaceCircle: async () =>
    hub.live
      ? {
          id: 'hub',
          slug: 'ojai-hub',
          name: 'Ojai',
          status: 'active',
          is_space_primary: true,
          space_id: 's1',
        }
      : null,
}))

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
  showPeople = false
  hub.live = false
  hasTiers = false
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

describe('the People tab (LIVE-420)', () => {
  it('hides from a visitor who cannot see the directory', async () => {
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).not.toContain('People')
  })

  it('is a real page once the viewer belongs here', async () => {
    showPeople = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).toContain('People')
    expect(hrefFor(tabs, 'People')).toBe('/spaces/ojai/people')
  })
})

describe('the Contact tab', () => {
  /** A Space whose operator has authored a contactForm block on the saved layout. */
  const withForm = () =>
    space({
      preferences: {
        pages: [{ slug: 'home', label: 'Home', doc: { content: [], root: {} } }],
        profileLayout: {
          rows: [{ id: 'r1', columns: 1, cells: [['contactForm']] }],
          content: { contactForm: { title: 'Work with us' } },
        },
      },
    } as unknown as Partial<Space>)

  it('stays closed on a Space that has neither a form nor published facts', async () => {
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).not.toContain('Contact')
  })

  it('opens once the operator has authored a contact form', async () => {
    const { tabs } = await buildSpaceProfileNav(withForm())
    expect(labels(tabs)).toContain('Contact')
    expect(hrefFor(tabs, 'Contact')).toBe('/spaces/ojai/contact')
  })

  it('opens on published contact facts alone', async () => {
    const withFacts = space({
      preferences: {
        pages: [{ slug: 'home', label: 'Home', doc: { content: [], root: {} } }],
        profileData: { phone: '760 555 0100' },
      },
    } as unknown as Partial<Space>)
    expect(labels((await buildSpaceProfileNav(withFacts)).tabs)).toContain('Contact')
  })

  it('a manager keeps it at zero, because that is where they set it up', async () => {
    manage.canManage = true
    expect(labels((await buildSpaceProfileNav(space())).tabs)).toContain('Contact')
  })

  // 🔴 THE "TWO REVIEWS" BUG, THIRD EDITION. The Home page still renders a `#contact` SECTION (so
  // the 16 stored "Get in touch" buttons keep resolving), but the menu must not list Contact twice
  // — once as an anchor that scrolls and once as a tab that navigates.
  it('never sits beside a #contact anchor in the menu', async () => {
    // TWO THINGS HAD TO BE RIGHT BEFORE THIS TEST MEANT ANYTHING, and the first version of it had
    // neither, so it passed against the mutant that deleted the suppression:
    //   1. The doc must live on `preferences.pageDocs`, not `preferences.pages[].doc`.
    //      `readProfilePages` strips the doc off a page entry, and `resolveSpacePageDoc` then falls
    //      back to the SEEDED DEFAULT — so a doc written into `pages[]` is never read at all.
    //   2. The block needs real props. `SpaceContact`'s presence arm reads its OWN fields (address /
    //      hours / phone / email / linkHref), not the presence bag, so a bare `{ id }` renders
    //      nothing and derives no anchor.
    const withAnchor = space({
      preferences: {
        pageDocs: {
          home: { content: [{ type: 'SpaceContact', props: { id: 'c', phone: '760 555 0100' } }], root: {} },
        },
        pages: [{ slug: 'home', label: 'Home' }],
        profileData: { phone: '760 555 0100' },
      },
    } as unknown as Partial<Space>)
    const { tabs } = await buildSpaceProfileNav(withAnchor)
    // The CONTROL: with the same doc but the suppression removed, an anchor WOULD be derived. The
    // `offerings` anchor beside it proves this doc really does produce section anchors, so a future
    // change that stops deriving them cannot make this assertion vacuously true.
    presence.events = true
    const control = await buildSpaceProfileNav(
      space({
        preferences: {
          pageDocs: {
            home: { content: [{ type: 'SpaceEvents', props: { id: 'e' } }], root: {} },
          },
          pages: [{ slug: 'home', label: 'Home' }],
        },
      } as unknown as Partial<Space>),
    )
    presence.events = false
    expect(control.tabs.map((t) => t.href)).toContain('/spaces/ojai#events')

    expect(tabs.filter((t) => t.label === 'Contact')).toHaveLength(1)
    expect(tabs.map((t) => t.href)).not.toContain('/spaces/ojai#contact')
  })
})

describe('the #reviews anchor — the original "two Reviews" bug', () => {
  // 🔴 ADDED 2026-09-25, AND IT WAS NOT COVERED BEFORE. `DEDICATED_TAB_ANCHORS` is named for this
  // case in its own comment, and removing `'reviews'` from the set broke NOTHING in this file —
  // measured by mutation while adding the Contact case. The suppression that the mechanism is
  // named after was the one arm of it nobody had pinned.
  it('never sits beside a /reviews tab in the menu', async () => {
    presence.reviews = true
    const withAnchor = space({
      preferences: {
        pageDocs: {
          home: { content: [{ type: 'SpaceReviews', props: { id: 'r' } }], root: {} },
        },
        pages: [{ slug: 'home', label: 'Home' }],
      },
    } as unknown as Partial<Space>)
    const { tabs } = await buildSpaceProfileNav(withAnchor)
    presence.reviews = false

    expect(tabs.filter((t) => t.label === 'Reviews')).toHaveLength(1)
    expect(hrefFor(tabs, 'Reviews')).toBe('/spaces/ojai/reviews')
    expect(tabs.map((t) => t.href)).not.toContain('/spaces/ojai#reviews')
  })
})

describe('the Discussion tab', () => {
  it('hides from a visitor when the Space Circle is off', async () => {
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).not.toContain('Discussion')
  })

  it('shows once the Space Circle is on', async () => {
    hub.live = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).toContain('Discussion')
    expect(hrefFor(tabs, 'Discussion')).toBe('/spaces/ojai/discussion')
  })

  it('a manager keeps it when the hub is off, so they can turn it on', async () => {
    manage.canManage = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).toContain('Discussion')
  })

  it('is never named Community', async () => {
    hub.live = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).not.toContain('Community')
  })

  it('ROOT never offers it', async () => {
    hub.live = true
    manage.canManage = true
    const { tabs } = await buildSpaceProfileNav(space({ type: 'root' }))
    expect(labels(tabs)).not.toContain('Discussion')
  })

  it('the `circles` FUNCTION being switched off hides it', async () => {
    hub.live = true
    manage.canManage = true
    const { tabs } = await buildSpaceProfileNav(
      space({ entitlements: { circles: false } as unknown as Space['entitlements'] }),
    )
    expect(labels(tabs)).not.toContain('Discussion')
  })
})

// THE MEMBERSHIPS TAB (LIVE-509), and the reason it had to exist.
//
// `/spaces/<slug>/book` has rendered the real tier picker for every membership-Focus Space since
// ENTITY-SPACES-SYSTEM 2.5, and exactly one link reached it: the profile's single header CTA. That
// button is operator-overridable, so an operator who repointed it (at contact, at offerings, at
// their own URL) orphaned their own paid memberships — live tiers, a working Stripe path, and
// nothing on the Space that led to them. These tests pin the door, so the menu no longer depends on
// what the header button happens to say.
describe('the Memberships tab', () => {
  it('HIDE AT ZERO: a visitor is never offered a tab over a Space with no tiers', async () => {
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).not.toContain('Memberships')
  })

  it('shows once the Space publishes a tier a visitor could join', async () => {
    hasTiers = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).toContain('Memberships')
  })

  it('is a real PAGE, so it does not depend on the header CTA pointing anywhere', async () => {
    hasTiers = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(hrefFor(tabs, 'Memberships')).toBe('/spaces/ojai/memberships')
  })

  it('a MANAGER keeps it at zero: the empty state is where the tiers get set up', async () => {
    manage.canManage = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).toContain('Memberships')
  })

  it('the `memberships` FUNCTION switched off hides it from everyone, manager included', async () => {
    hasTiers = true
    manage.canManage = true
    const { tabs } = await buildSpaceProfileNav(
      space({ entitlements: { memberships: false } as unknown as Space['entitlements'] }),
    )
    expect(labels(tabs)).not.toContain('Memberships')
  })

  it('ROOT never offers it: the platform tenant sells its own plans at /pricing', async () => {
    hasTiers = true
    manage.canManage = true
    const { tabs } = await buildSpaceProfileNav(space({ type: 'root' as Space['type'] }))
    expect(labels(tabs)).not.toContain('Memberships')
  })

  it('appears exactly once, so it is never a second menu row beside itself', async () => {
    hasTiers = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs).filter((l) => l === 'Memberships')).toHaveLength(1)
  })
})
