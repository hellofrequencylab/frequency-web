import { getCallerProfile } from '@/lib/auth'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType, spaceManageHref, type Space } from '@/lib/spaces/types'
import { readProfilePages, resolveSpacePageDoc, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { deriveSectionNav } from '@/lib/spaces/section-anchors'
import { getSpaceSectionPresence } from '@/lib/spaces/content-data'
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

  const [presence, manage] = await Promise.all([
    getSpaceSectionPresence(space.id, space.slug),
    resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole ?? null),
  ])

  const pages = readProfilePages(space.preferences)
  const homeDoc = resolveSpacePageDoc(space.preferences, brandName, HOME_SLUG)
  const sections = deriveSectionNav(homeDoc, presence)

  const tabs: SpaceProfileTab[] = [
    { href: base, label: pages[0]?.label ?? 'Home' },
    ...sections.map((s) => ({ href: `${base}#${s.anchor}`, label: s.label })),
    ...pages
      .filter((p) => p.slug !== HOME_SLUG)
      .map((p) => ({ href: `${base}/${p.slug}`, label: p.label })),
  ]

  const canSeeAsOwner = manage.canManage || manage.staffViewing
  const adminTabs: SpaceProfileTab[] = canSeeAsOwner
    ? [
        { href: spaceManageHref(space.type, space.slug), label: 'Manage' },
        ...(isConsoleSpaceType(space.type) ? [{ href: `${base}/crm`, label: 'CRM' }] : []),
      ]
    : []

  return { tabs, adminTabs }
}
