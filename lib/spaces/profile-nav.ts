import { getCallerProfile } from '@/lib/auth'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType, spaceManageHref, type Space } from '@/lib/spaces/types'
import { readProfilePages, resolveSpacePageDoc, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { readStorefrontConfig } from '@/lib/spaces/storefront'
import { spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { deriveSectionNav } from '@/lib/spaces/section-anchors'
import { getSpaceSectionPresence } from '@/lib/spaces/content-data'
import { spaceHasPublicUpcomingEvents } from '@/lib/events/store'
import { spaceHasCollaborators } from '@/lib/spaces/collaborations'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// THE ONE Space profile sub-nav model — the tab set + the operator's admin links — resolved from the
// Space itself, so the SAME menu renders on the public profile chrome AND on the owner surfaces
// (manage / crm). Extracted here (from the (profile) chrome layout) precisely so the sticky sub-nav can
// be identical across those routes: the profile chrome layout and the owner shell layouts both call this
// and hand the result to <SpaceStickyNav>, giving the member a persistent menu whose body swaps beneath
// it without a full reload (the "persistent shell" model). Server-only; the active-tab state stays
// client-side in SpaceProfileTabs (usePathname), so nothing here can go stale across soft navigation.
export interface SpaceProfileNav {
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
export async function buildSpaceProfileNav(space: Space): Promise<SpaceProfileNav> {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  const brandName = space.brandName ?? space.name
  const base = `/spaces/${space.slug}`

  const [presence, manage, hasCalendarEvents, hasCollaborators] = await Promise.all([
    getSpaceSectionPresence(space.id, space.slug),
    resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole ?? null),
    // Gate the Calendar tab on the SAME public/unlisted published set the calendar renders, not on the
    // broader presence.events (which counts drafts/private/circle_only) — otherwise the tab would show
    // over an empty grid for a member-only-event space.
    spaceHasPublicUpcomingEvents(space.id),
    // The Collaborators tab shows only when there is at least one ACCEPTED collaboration (ADR-799 B1).
    spaceHasCollaborators(space.id),
  ])

  const pages = readProfilePages(space.preferences)
  const homeDoc = resolveSpacePageDoc(space.preferences, brandName, HOME_SLUG)
  // Community and Reviews are their OWN dedicated tabs / pages now (added below), so an in-page section
  // anchor for either is a DUPLICATE nav link (the "two Reviews" bug: a stray #reviews anchor beside the
  // real /reviews tab, scrolling to nothing). Drop those anchors here so the dedicated tab is the only one.
  const DEDICATED_TAB_ANCHORS = new Set(['community', 'reviews'])
  const sections = deriveSectionNav(homeDoc, presence).filter((s) => !DEDICATED_TAB_ANCHORS.has(s.anchor))
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

  const tabs: SpaceProfileTab[] = [
    { href: base, label: pages[0]?.label ?? 'Home' },
    ...sections.map((s) => ({ href: `${base}#${s.anchor}`, label: s.label })),
    // The Community feed (Facebook/Yelp-style): the business posts, members react + comment. Public to
    // everyone; the page itself gates who can interact. Always present so a business can start posting.
    { href: `${base}/community`, label: 'Community' },
    // The Calendar tab (Events EC2): a month grid of the Space's events + a subscribe-to-calendar feed.
    // Shown only when the Space has upcoming PUBLIC events (the exact set the grid renders), so the tab
    // never opens onto an empty calendar.
    ...(hasCalendarEvents ? [{ href: `${base}/calendar`, label: 'Calendar' }] : []),
    // The Collaborators tab (ADR-799 B1): the businesses that operate together with this space. Shown
    // only when there is at least one accepted collaboration.
    ...(hasCollaborators ? [{ href: `${base}/collaborators`, label: 'Collaborators' }] : []),
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

  const canSeeAsOwner = manage.canManage || manage.staffViewing
  // Just "Manage" now: the CRM has no separate menu item (it lives inside the Manage dashboard's
  // Community area). `spaceManageHref` is the full-page console; the profile menu instead opens the
  // in-place `?panel=manage` dashboard, but this Manage tab still backs the /manage + shell layouts.
  const adminTabs: SpaceProfileTab[] = canSeeAsOwner
    ? [{ href: spaceManageHref(space.type, space.slug), label: 'Manage' }]
    : []

  return { tabs, adminTabs }
}
