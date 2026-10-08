import { collectiveNetworkOpen } from '@/lib/collective/network'
import { getCallerProfile } from '@/lib/auth'
import type { WebRole } from '@/lib/core/roles'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType, spaceManageHref, type Space } from '@/lib/spaces/types'
import { readProfilePages, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { readStorefrontConfig } from '@/lib/spaces/storefront'
import { spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { parseEntityLayout, resolveRows } from '@/lib/entity-blocks/layout'
import { deriveModuleSectionNav } from '@/lib/spaces/module-section-nav'
import { getSpaceSectionPresence } from '@/lib/spaces/content-data'
import { spaceHasPublicUpcomingEvents } from '@/lib/events/store'
import { spaceHasCollaborators } from '@/lib/spaces/collaborations'
import { viewerCanSeeSpaceMemberDirectory } from '@/lib/spaces/member-directory'
import { canSeeSpaceContactTab, readContactFormContent } from '@/lib/spaces/contact-tab'
import { canSeeSpaceMembershipsTab } from '@/lib/spaces/memberships-tab'
import { spaceHasActiveMembershipTiers } from '@/lib/spaces/memberships'
import { readProfileData } from '@/lib/spaces/profile-data'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// THE ONE Space profile sub-nav model — the tab set + the operator's admin links — resolved from the
// Space itself, so the SAME menu renders on the public profile chrome AND on the owner surfaces
// (manage / crm). Extracted here (from the (profile) chrome layout) precisely so the sticky sub-nav can
// be identical across those routes: the profile chrome layout and the owner shell layouts both call this
// and hand the result to <SpaceStickyNav>, giving the member a persistent menu whose body swaps beneath
// it without a full reload (the "persistent shell" model). Server-only; the active-tab state stays
// client-side in SpaceProfileTabs (usePathname), so nothing here can go stale across soft navigation.
interface SpaceProfileNav {
  /** Home + one anchor per live Home section + the operator's custom sub-pages. */
  tabs: SpaceProfileTab[]
  /** The operator's back-end links (Manage / CRM), empty for a visitor. */
  adminTabs: SpaceProfileTab[]
}

/**
 * Build the profile sub-nav for `space`, given the viewer. The tabs are PRE-POPULATED from the page
 * itself (feature-block model): Home, then one anchor per Home section that actually renders (derived
 * from the Home doc + live presence, so a link never scrolls to an empty spot), then any custom pages.
 * The admin links (Manage + CRM for console types) show ONLY to a manager / staff previewer. Reads the
 * caller internally (request-cached) so both the chrome layout and the owner shells can call it plainly.
 */
/** Whether the Space published any way to reach it. Pure, and read from the SAME node the Contact
 *  card renders from (readProfileData), so the tab and the card can never disagree about whether
 *  there is anything to show. */
function readProfileLayoutNode(preferences: unknown): unknown {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null
  return (preferences as Record<string, unknown>).profileLayout ?? null
}

function hasContactFacts(preferences: unknown): boolean {
  const p = readProfileData(preferences)
  return !!(p.address || p.phone || p.email || p.hours || p.website)
}

/** Who the menu is being built FOR. `null` means NOBODY: the signed-out, ISR-rendered share URL,
 *  where reading a cookie would make the route dynamic (ADR-1465 / ADR-1526). */
interface SpaceNavViewer {
  profileId: string | null
  webRole: WebRole | null
}

/**
 * The menu for the SIGNED-IN member surfaces. Reads the caller itself, as it always has.
 */
export async function buildSpaceProfileNav(space: Space): Promise<SpaceProfileNav> {
  const caller = await getCallerProfile()
  return buildNavFor(space, { profileId: caller?.id ?? null, webRole: caller?.webRole ?? null })
}

/**
 * The menu for the SIGNED-OUT share URL (LIVE-522), and the reason this split exists.
 *
 * 🔴 IT MUST NOT READ A COOKIE. `app/(public)/spaces/[slug]` is the ISR body the canonical
 * `/spaces/<slug>` serves to a visitor and to every crawler. One `cookies()` anywhere beneath it
 * turns the route dynamic and the ISR contract (ADR-1465, ADR-1526) is gone — which is why this
 * is a separate entry point rather than a `viewer` argument someone could forget to pass.
 *
 * Proven rather than promised: `profile-nav.public.test.ts` makes `getCallerProfile` THROW and
 * asserts this function still resolves a menu. Any future reader of the caller on this path
 * fails that test by name instead of quietly costing the share URL its cache.
 */
export async function buildPublicSpaceProfileNav(space: Space): Promise<SpaceProfileNav> {
  return buildNavFor(space, null)
}

async function buildNavFor(space: Space, viewer: SpaceNavViewer | null): Promise<SpaceProfileNav> {
  const viewerProfileId = viewer?.profileId ?? null

  const base = `/spaces/${space.slug}`

  const [presence, manage, hasCalendarEvents, hasCollaborators, showPeople, hasTiers] = await Promise.all([
    getSpaceSectionPresence(space.id, space.slug),
    resolveSpaceManageAccess(space, viewerProfileId, viewer?.webRole ?? null),
    // Gate the Calendar tab on the SAME public/unlisted published set the calendar renders, not on the
    // broader presence.events (which counts drafts/private/circle_only) — otherwise the tab would show
    // over an empty grid for a member-only-event space.
    spaceHasPublicUpcomingEvents(space.id),
    // The Collaborators tab shows only when there is at least one ACCEPTED collaboration (ADR-799 B1).
    spaceHasCollaborators(space.id),
    // People (LIVE-420): fellow members and managers only. Visitors never get a tab over a roster
    // they cannot read. ROOT is refused inside the reader.
    // 🔴 THE ONE READER ON THIS LIST THAT READS THE CALLER ITSELF (getCallerProfile, inside
    // member-directory.ts), so it cannot run on the anonymous path without costing the share URL
    // its ISR. A visitor never sees the People tab anyway -- the pure rule behind that reader
    // refuses a non-member -- so `false` here is the SAME answer, arrived at without a cookie.
    viewer === null ? Promise.resolve(false) : viewerCanSeeSpaceMemberDirectory(space),
    // 🔻 ONE READ FEWER PER MENU BUILD (LIVE-523). The nav used to resolve the Space Circle here for
    // the sole purpose of deciding the Discussion row. That row is gone — the conversation leads the
    // Circles tab now — so the hub lookup went with it rather than being left as a result nobody
    // reads. The Circles page does its own hub read, where the feed it gates is actually rendered.
    // Memberships: at least one ACTIVE tier, read through the SAME request-cached reader the tab's
    // own body renders from, so the menu and the page cannot disagree about whether there is
    // anything behind the door. ROOT is skipped rather than read: the gate refuses it anyway.
    space.type === 'root' ? Promise.resolve(false) : spaceHasActiveMembershipTiers(space.id),
  ])

  const pages = readProfilePages(space.preferences)
  // 🔴 DERIVED FROM THE GRID THE PAGE RENDERS, NOT FROM A PUCK DOC (LIVE-517). ADR-508 U3 cut the
  // Home body over to the module engine: `(profile)/full/page.tsx` renders
  // `resolveRows(parseEntityLayout(preferences.profileLayout) ?? {}, 'space')` and never reads the
  // doc. These two lines are that same expression, so the menu and the body resolve the SAME rows
  // — including the fall-through, where an absent / malformed node parses to null, `?? {}` keeps
  // the grid truthy, and resolveRows returns the kind's starter layout for both of them.
  //
  // What this replaced: `resolveSpacePageDoc(...)`, which for a Space with no stored `pageDocs`
  // (Royal Temple, and every Space seeded since the cutover) returned the SEEDED DEFAULT doc — so
  // the menu described a template the operator never edited and the page never drew.
  const grid = parseEntityLayout(readProfileLayoutNode(space.preferences)) ?? {}
  // Reviews is its OWN dedicated tab / page (added below), so an in-page section anchor for it is a
  // DUPLICATE nav link (the "two Reviews" bug: a stray #reviews anchor beside the real /reviews tab,
  // scrolling to nothing). Drop that anchor here so the dedicated tab is the only one.
  // `circles` joins it for the same reason (ADR-1094): Circles is a real tab now, so the Home
  // block's #circles anchor beside it is the "two Reviews" bug a second time, a stray menu link
  // scrolling to a section that may not even be in the saved layout.
  // `contact` joins them for the THIRD time this bug has been available: Contact is a real tab now
  // (LIVE-502), so a `#contact` anchor beside it would be a second menu item with the same word on
  // it, one scrolling and one navigating. The SECTION still renders on Home and the anchor still
  // resolves — this only stops the menu listing it twice, which is what the stored "Get in touch"
  // buttons depend on.
  // `events` joins them for the FOURTH time (LIVE-520, owner ask: "Calendar & Events should be all
  // one page"). Calendar and Events were two menu items over one subject — this `#events` anchor
  // into Home beside the dedicated Calendar tab below — which is the same bug in its most literal
  // form: two rows in one menu, one scrolling and one navigating, for the same gatherings. The
  // Calendar tab is now the merged page (the Up next feed above the month), so the anchor comes
  // off. The SECTION still renders on Home and `#events` still resolves; `/spaces/<slug>/events`
  // forwards to the merged page so the word keeps an address.
  const DEDICATED_TAB_ANCHORS = new Set(['reviews', 'circles', 'contact', 'events'])
  const sections = deriveModuleSectionNav(resolveRows(grid, 'space'), presence, grid.content).filter(
    (s) => !DEDICATED_TAB_ANCHORS.has(s.anchor),
  )
  // The public Shop tab (ADR-596): shown only when the owner has published their storefront, with the
  // owner's chosen (renameable) label. The catalog is gated status='active' and the route double-gates on
  // `published`, so this surfaces only a real, opted-in storefront. Shop is now a gateable function, so the
  // tab also requires the `shop` function to be ENABLED for the space (on/off only — a public tab is never
  // role-gated). A shop def always exists; the fallback keeps the tab if the registry ever lacks it.
  const storefront = readStorefrontConfig(space.preferences)
  const shopDef = spaceFunctionDef('shop')
  const shopEnabled = !shopDef || spaceFunctionEnabled(space, shopDef)
  // The Reviews tab is gated on the `reviews` function (default ON): the owner may turn the rating +
  // review wall off in the Module Manager. A missing def keeps the tab (fail-safe to shown).
  const reviewsDef = spaceFunctionDef('reviews')
  const reviewsEnabled = !reviewsDef || spaceFunctionEnabled(space, reviewsDef)
  // The Circles tab (ADR-1094): gated on the `circles` function AND on there being something behind
  // it, the same honest-empty rule Calendar, Collaborators and Shop follow. `presence.circles` is
  // the SAME request-cached read the Home teaser block renders from, so the gate and the page can
  // never disagree about whether a visitor would find anything. ROOT never shows it: every personal
  // circle on the platform is stamped to the root tenant, and the tab notFound()s there.
  // Memberships (LIVE-509): gated on the `memberships` function, which is a hard off for a manager
  // too — a Space that switched memberships off in the Module Manager has said it does not sell
  // them. A missing def keeps the tab (fail-safe to shown), like every sibling above.
  const membershipsDef = spaceFunctionDef('memberships')
  const membershipsEnabled = !membershipsDef || spaceFunctionEnabled(space, membershipsDef)
  const circlesDef = spaceFunctionDef('circles')
  const circlesEnabled = (!circlesDef || spaceFunctionEnabled(space, circlesDef)) && space.type !== 'root'

  // Resolved BEFORE the tab list, which reads it: a manager keeps the Circles tab at zero so the
  // "Start your first circle" empty state stays reachable.
  const canSeeAsOwner = manage.canManage || manage.staffViewing

  const tabs: SpaceProfileTab[] = [
    { href: base, label: pages[0]?.label ?? 'Home' },
    ...sections.map((s) => ({ href: `${base}#${s.anchor}`, label: s.label })),
    // The Calendar tab — THE MERGED CALENDAR AND EVENTS PAGE (LIVE-520). The Up next feed, the month
    // grid, the agenda, and the subscribable feed, on one page and behind ONE menu row; the `#events`
    // anchor that used to sit beside it is suppressed above. The label stays "Calendar" because the
    // URL, the `.ics` feed, the page metadata and every operator deep link (`?view=`, `?console=1`)
    // all say calendar, and a menu word that disagreed with all of them would be a second name for
    // one thing. Shown only when the Space has upcoming PUBLIC events (the exact set the grid
    // renders), so the tab never opens onto an empty calendar.
    ...(hasCalendarEvents ? [{ href: `${base}/calendar`, label: 'Calendar' }] : []),
    ...(collectiveNetworkOpen(space) ? [{ href: `${base}/network`, label: 'Network' }] : []),
    // Memberships (LIVE-509): the Space's tiers, and the door that joins one. Sits high, right after
    // Calendar, because it is the commercial answer to "what is this place" and it was previously
    // reachable ONLY through the one operator-overridable header button. A visitor gets it once the
    // Space publishes a tier they could join; a manager gets it at zero, because the empty state is
    // where they set it up.
    ...(canSeeSpaceMembershipsTab({
      spaceType: space.type,
      membershipsEnabled,
      hasActiveTiers: hasTiers,
      canManage: canSeeAsOwner,
    })
      ? [{ href: `${base}/memberships`, label: 'Memberships' }]
      : []),
    // The Collaborators tab (ADR-799 B1): the businesses that operate together with this space. Shown
    // only when there is at least one accepted collaboration.
    ...(hasCollaborators ? [{ href: `${base}/collaborators`, label: 'Collaborators' }] : []),
    // Circles: a Space's community IS its Circles (NAMING.md, ADR-1091), and this is where they are.
    // A manager sees it even at zero, because the empty state is where "Start your first circle"
    // lives; a visitor only sees it once there is a circle they could actually open.
    ...(circlesEnabled && (presence.circles || canSeeAsOwner) ? [{ href: `${base}/circles`, label: 'Circles' }] : []),
    // People: the member directory of space_memberships, never the staff roster at settings/members.
    // Shown only to an active member or a manager (ADR-1471).
    ...(showPeople ? [{ href: `${base}/people`, label: 'People' }] : []),
    // NO DISCUSSION ROW (LIVE-523, ADR-1534 amending ADR-1469 §2). The Space Circle's feed now LEADS
    // the Circles tab above, and the other circles are indexed beneath it, so the Space's community
    // is one page. A dedicated Discussion row beside Circles was two menu rows over one subject —
    // the same defect as the `#reviews`, `#circles`, `#contact` and (in #2916) `#events` anchors
    // sitting beside their own tabs. `/spaces/<slug>/discussion` still resolves and forwards to
    // `…/circles#discussion`, and the SECTION is still named Discussion, so the canon keeps its word.
    // Contact (LIVE-502): the Space's own door for someone who wants to reach it — the operator's
    // contact form, then the published facts. Shown once the Space has EITHER (so nobody wakes up
    // with a public lead door they did not ask for); a manager sees it at zero because that is
    // where they set it up. Sits beside Discussion rather than replacing it: the conversation door
    // does not close until the Space home carries the feed, or a Space would briefly have neither.
    ...(canSeeSpaceContactTab({
      spaceType: space.type,
      hasFormBlock: Object.keys(readContactFormContent(space.preferences)).length > 0,
      hasContactFacts: hasContactFacts(space.preferences),
      canManage: canSeeAsOwner,
    })
      ? [{ href: `${base}/contact`, label: 'Contact' }]
      : []),
    // Reviews on their own tab (owner decision): the member rating + review wall. Public read; a signed-in
    // member (not the owner) leaves one review they can revise. Gated on the `reviews` function (default ON).
    ...(reviewsEnabled ? [{ href: `${base}/reviews`, label: 'Reviews' }] : []),
    ...(storefront.published && isConsoleSpaceType(space.type) && shopEnabled
      ? [{ href: `${base}/shop`, label: storefront.tabLabel }]
      : []),
    ...pages
      .filter((p) => p.slug !== HOME_SLUG)
      .map((p) => ({ href: `${base}/${p.slug}`, label: p.label })),
  ]

  // Just "Manage" now: the CRM has no separate menu item (it lives inside the Manage dashboard's
  // Community area). `spaceManageHref` is the full-page console; the profile menu instead opens the
  // in-place `?panel=manage` dashboard, but this Manage tab still backs the /manage + shell layouts.
  const adminTabs: SpaceProfileTab[] = canSeeAsOwner
    ? [{ href: spaceManageHref(space.type, space.slug), label: 'Manage' }]
    : []

  return { tabs, adminTabs }
}
