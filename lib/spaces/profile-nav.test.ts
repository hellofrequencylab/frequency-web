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
let hasEvents = false
vi.mock('@/lib/events/store', () => ({ spaceHasPublicUpcomingEvents: async () => hasEvents }))
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
  hasEvents = false
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
    // REWRITTEN FOR THE MODULE DERIVATION (LIVE-517). The previous version staged a Puck doc on
    // `preferences.pageDocs`, and the menu no longer reads one — so after the cutover it passed
    // whatever the suppression did, which is the failure its own comment warned about. The fixture
    // is now the node the body renders from: `preferences.profileLayout`.
    //
    // TWO THINGS STILL HAVE TO BE RIGHT for this to mean anything:
    //   1. The block must be in the LAYOUT rows, because that is what resolveRows walks.
    //   2. `contact` is an AUTHORED block — it is judged by its own content bag, not the presence
    //      flags — so the bag needs real keys or no anchor is derived and the test is vacuous.
    const withAnchor = space({
      preferences: {
        profileLayout: {
          rows: [{ id: 'r1', columns: 1, cells: [['contact', 'faq']] }],
          // `title` / `eyebrow` are the keys the contact block's authored schema keeps. MEASURED:
          // a bag of `{ phone }` is SANITIZED AWAY by parseEntityLayout, which silently made the
          // first version of this fixture derive no anchor and pass no matter what.
          content: { contact: { title: 'Reach us' } },
        },
        profileData: { phone: '760 555 0100' },
      },
    } as unknown as Partial<Space>)
    presence.faqs = true
    const { tabs } = await buildSpaceProfileNav(withAnchor)
    presence.faqs = false

    // THE CONTROL, and it is load-bearing TWICE OVER. `#faq` sits in the same layout row, so its
    // presence proves anchors are derived at all — AND `faq` is NOT in the kind's starter layout
    // (about / offerings / booking / events / team / reviews / contact), so it can ONLY have come
    // from this fixture's own `profileLayout`. The first draft used `events` here, which the
    // starter also carries, so it passed without the fixture being read at all. Measured: with
    // `events` as the control, deleting 'contact' from DEDICATED_TAB_ANCHORS did NOT fail this
    // test. With `faq` it does.
    expect(tabs.map((t) => t.href)).toContain('/spaces/ojai#faq')

    expect(tabs.filter((t) => t.label === 'Contact')).toHaveLength(1)
    expect(tabs.map((t) => t.href)).not.toContain('/spaces/ojai#contact')
  })
})

describe('the menu is derived from the page that renders (LIVE-517)', () => {
  // ADR-508 U3 moved the Home body to the module engine. These pin that the menu moved with it.
  it('derives an anchor from a block in the saved layout', async () => {
    presence.faqs = true
    const { tabs } = await buildSpaceProfileNav(
      space({
        preferences: { profileLayout: { rows: [{ id: 'r1', columns: 1, cells: [['faq']] }] } },
      } as unknown as Partial<Space>),
    )
    presence.faqs = false
    // FAQ had NO entry in the Puck anchor map at all, so this link could not exist before.
    expect(tabs.map((t) => t.href)).toContain('/spaces/ojai#faq')
  })

  it('links Book to #booking, the id the section actually mounts under', async () => {
    presence.booking = true
    const { tabs } = await buildSpaceProfileNav(
      space({
        preferences: { profileLayout: { rows: [{ id: 'r1', columns: 1, cells: [['booking']] }] } },
      } as unknown as Partial<Space>),
    )
    presence.booking = false
    expect(hrefFor(tabs, 'Book')).toBe('/spaces/ojai#booking')
    // The old map said `#book`, which no block renders.
    expect(tabs.map((t) => t.href)).not.toContain('/spaces/ojai#book')
  })

  it('a stored Puck doc no longer drives the menu, because nothing renders it', async () => {
    presence.practices = true
    const { tabs } = await buildSpaceProfileNav(
      space({
        preferences: {
          // A doc claiming Practices, on a layout that holds none.
          pageDocs: { home: { content: [{ type: 'SpacePractices', props: { id: 'p' } }], root: {} } },
          pages: [{ slug: 'home', label: 'Home' }],
          profileLayout: { rows: [{ id: 'r1', columns: 1, cells: [['events']] }] },
        },
      } as unknown as Partial<Space>),
    )
    presence.practices = false
    expect(tabs.map((t) => t.href)).not.toContain('/spaces/ojai#practices')
  })

  it('a Space that never opened the builder still gets its starter sections', async () => {
    // WAS `events` UNTIL LIVE-520, and it had to move: `events` is a DEDICATED_TAB_ANCHORS entry now
    // (Calendar and Events are one page), so it can never appear as an anchor and would make this
    // test fail for the right reason while saying the wrong thing. `booking` is also in the kind
    // starter (about / offerings / booking / events / team / reviews / contact) and is not
    // suppressed, so it proves the same thing: the fall-through derives anchors.
    presence.booking = true
    const { tabs } = await buildSpaceProfileNav(space())
    presence.booking = false
    // No saved layout: resolveRows falls to the kind starter, which the BODY renders too.
    expect(tabs.map((t) => t.href)).toContain('/spaces/ojai#booking')
  })
})

describe('the #events anchor — Calendar and Events are one page (LIVE-520)', () => {
  // 🔴 THE "TWO REVIEWS" BUG, FOURTH EDITION, and the most literal one yet: the Space menu carried
  // an "Events" row that scrolled to a Home section AND a "Calendar" row that navigated to the
  // month grid, for the same gatherings. The owner's ask was "Calendar & Events should be all one
  // page", so the page merged and the anchor comes off. The SECTION still renders on Home and
  // `#events` still resolves; what stops is the menu listing the same subject twice.
  it('never sits beside the Calendar tab in the menu', async () => {
    hasEvents = true
    presence.events = true
    presence.faqs = true
    const withAnchor = space({
      preferences: { profileLayout: { rows: [{ id: 'r1', columns: 1, cells: [['events', 'faq']] }] } },
    } as unknown as Partial<Space>)
    const { tabs } = await buildSpaceProfileNav(withAnchor)
    hasEvents = false
    presence.events = false
    presence.faqs = false

    // THE CONTROL, and `faq` for the same reason the Contact and Reviews cases use it: it is in this
    // fixture's layout and NOT in the kind starter, so its anchor proves these rows were read at all.
    // Measured: with the control in place, deleting 'events' from DEDICATED_TAB_ANCHORS fails this
    // test by name.
    expect(tabs.map((t) => t.href)).toContain('/spaces/ojai#faq')

    expect(tabs.map((t) => t.href)).not.toContain('/spaces/ojai#events')
    expect(tabs.filter((t) => t.label === 'Events')).toHaveLength(0)
    // ONE row, and it is the merged page.
    expect(tabs.filter((t) => t.label === 'Calendar')).toHaveLength(1)
    expect(hrefFor(tabs, 'Calendar')).toBe('/spaces/ojai/calendar')
  })
})

describe('the #reviews anchor — the original "two Reviews" bug', () => {
  // 🔴 ADDED 2026-09-25, AND IT WAS NOT COVERED BEFORE. `DEDICATED_TAB_ANCHORS` is named for this
  // case in its own comment, and removing `'reviews'` from the set broke NOTHING in this file —
  // measured by mutation while adding the Contact case. Re-staged on the layout for LIVE-517.
  it('never sits beside a /reviews tab in the menu', async () => {
    presence.reviews = true
    presence.faqs = true
    const withAnchor = space({
      preferences: { profileLayout: { rows: [{ id: 'r1', columns: 1, cells: [['reviews', 'faq']] }] } },
    } as unknown as Partial<Space>)
    const { tabs } = await buildSpaceProfileNav(withAnchor)
    presence.reviews = false
    presence.faqs = false

    // Same control as above, and `faq` for the same reason: it is absent from the starter, so it
    // proves THIS layout was read rather than the fallback.
    expect(tabs.map((t) => t.href)).toContain('/spaces/ojai#faq')
    expect(tabs.filter((t) => t.label === 'Reviews')).toHaveLength(1)
    expect(hrefFor(tabs, 'Reviews')).toBe('/spaces/ojai/reviews')
    expect(tabs.map((t) => t.href)).not.toContain('/spaces/ojai#reviews')
  })
})

// THE DISCUSSION ROW IS DELIBERATELY GONE (LIVE-523, ADR-1534 amending ADR-1469 §2).
//
// This block used to assert the opposite, case for case: that a live hub ADDS a `Discussion` tab
// pointing at `/spaces/<slug>/discussion`, and that a manager keeps it at zero. Those cases pinned
// the defect as a contract — two menu rows over one subject, the same shape as the `#reviews`,
// `#circles`, `#contact` and `#events` anchors sitting beside their own tabs — so they are rewritten
// here rather than deleted, which is how this repo records a reversal (#2916 did the same to the
// two calendar tests it overturned).
//
// The conversation did not go away. It LEADS `/spaces/<slug>/circles`, under an <h2> still named
// Discussion, at the anchor `#discussion`, and the old URL forwards there. What must never come
// back is a second menu row for it.
describe('the Space menu carries ONE row for the community', () => {
  it('a live Space Circle adds no second row beside Circles', async () => {
    hub.live = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).not.toContain('Discussion')
    expect(tabs.map((t) => t.href)).not.toContain('/spaces/ojai/discussion')
  })

  it('a manager gets no second row either, live hub or not', async () => {
    manage.canManage = true
    for (const live of [false, true]) {
      hub.live = live
      const { tabs } = await buildSpaceProfileNav(space())
      expect(labels(tabs), `hub live: ${live}`).not.toContain('Discussion')
    }
  })

  // The control, so the case above cannot pass because the menu is empty or the mock broke: the
  // ONE community row is still built, and it is Circles.
  it('still carries the Circles row, which is the page the conversation now leads', async () => {
    hub.live = true
    // `circles` presence is what puts the row there at all (ADR-1094); without it this control
    // would pass for the wrong reason, by finding no menu rather than finding one row.
    presence.circles = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).toContain('Circles')
    expect(hrefFor(tabs, 'Circles')).toBe('/spaces/ojai/circles')
  })

  it('is never named Community', async () => {
    hub.live = true
    const { tabs } = await buildSpaceProfileNav(space())
    expect(labels(tabs)).not.toContain('Community')
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
