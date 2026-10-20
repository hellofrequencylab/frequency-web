import 'server-only'
import type { ReactNode } from 'react'
import { getCachedViewerProfile, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { SPACE_MODULES } from '@/lib/admin/modules/space-modules'
import { SPACE_HUB_SECTIONS, sectionForModule, type SpaceHubSection } from '@/lib/admin/modules/space-hub'
import { siteAdminHandoffPath } from '@/lib/sites/site-admin-pass'
import { resolveOperatorContext } from '@/lib/context/resolve-context'
import { getUnreadCount } from '@/app/(main)/notifications/actions'
import type { FqIconName } from '@/components/frequency/icon'
import { AdminShell } from './admin-shell'
import type { AdminNavItem } from './nav-model'

// THE SPACE CONSOLE IN THE FREQUENCY SHELL (/spaces/<slug>/manage, /crm and /settings under
// SITE_DESIGN === 'frequency'). The sidebar is the console's own hub tabs, SPACE_HUB_SECTIONS (the
// route-local grouping over SPACE_MODULES the DAWN HubNav renders), in their order; each tab also claims
// the pages its catalog rows deep-link to, so /spaces/<slug>/settings/offerings lights Offerings & Money.
// One door is added after Home: the Space website editor ("Page editor" in the design), through the
// existing handoff the Leadership page uses (siteAdminHandoffPath), and only for a real manager, because a
// staff preview pass cannot open the editor.
//
// The gate here is framing only. A viewer who cannot manage this Space gets the page bare, and the page's
// own gate (notFound) decides; nothing is revealed by the chrome.

const SECTION_ICON: Record<SpaceHubSection, FqIconName> = {
  dashboard: 'space',
  resonance: 'contacts',
  marketing: 'nudge',
  offerings: 'membership',
  programs: 'program',
  settings: 'settings',
}

/** The phone bar's five slots (the fifth is More): the short labels, in the owner's order. The page title
 *  keeps the full tab name. Marketing and Profile & Settings fall into the More sheet. */
const PHONE_SLOT: Partial<Record<SpaceHubSection, { label: string; slot: number }>> = {
  dashboard: { label: 'Home', slot: 0 },
  resonance: { label: 'Community', slot: 1 },
  programs: { label: 'Programs', slot: 2 },
  offerings: { label: 'Money', slot: 3 },
}

/** The hub tabs as sidebar rows, each claiming its catalog rows' pages. PURE. */
export function spaceNavItems(slug: string, editor: boolean): AdminNavItem[] {
  const base = `/spaces/${slug}`
  const items: AdminNavItem[] = SPACE_HUB_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    href: section.key === 'dashboard' ? `${base}/manage` : `${base}/manage?section=${section.key}`,
    icon: SECTION_ICON[section.key],
    phone: PHONE_SLOT[section.key],
    match: SPACE_MODULES.flatMap((module) => {
      // Check in has its own row below, so the Money tab does not also claim its page.
      if (module.id === 'space.scanners' || sectionForModule(module) !== section.key || !module.deepLink) return []
      const path = module.deepLink(slug).split('#')[0]
      return path === `${base}/manage` ? [] : [path]
    }),
  }))
  // CHECK IN (LIVE-1177): the door has its own sidebar row, right after the Money tab it lives under, so it is
  // never a search. It has no phone slot, so under 960px it sits at the top of the More sheet's Console list.
  const money = items.findIndex((item) => item.key === 'offerings')
  items.splice(money + 1, 0, { key: 'checkin', label: 'Check in', href: `${base}/settings/offerings?tab=checkin`, icon: 'checkin' })
  if (editor) items.splice(1, 0, { key: 'editor', label: 'Page editor', href: siteAdminHandoffPath(slug, 'editor'), icon: 'page', external: true })
  return items
}

export async function FrequencySpaceConsole({ slug, children }: { slug: string; children: ReactNode }) {
  const caller = await getCallerProfile()
  if (!caller) return children
  const space = await getVisibleSpaceBySlug(slug, caller.id)
  if (!space || !isConsoleSpaceType(space.type)) return children
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller.id, caller.webRole)
  if (!canManage && !staffViewing) return children

  const [me, contexts, unread] = await Promise.all([
    getCachedViewerProfile(),
    resolveOperatorContext({ id: caller.id, webRole: caller.webRole }),
    getUnreadCount().catch(() => 0),
  ])
  const name = space.brandName?.trim() || space.name
  const role = space.ownerProfileId === caller.id ? 'Owner' : canManage ? 'Team' : 'Staff preview'
  const items = spaceNavItems(space.slug, canManage)

  return (
    <AdminShell
      homeHref={`/spaces/${space.slug}/manage`}
      crumbRoot={name}
      navLabel={`${name} console`}
      space={{
        name,
        role: `Space · ${role}`,
        avatarUrl: space.brandLogoUrl ?? space.coverImageUrl ?? null,
        switchTo: contexts.available.flatMap((option) => {
          if (option.kind === 'operator' && option.spaceId !== space.id) return [{ key: option.spaceId, label: option.label, href: option.href, avatarUrl: option.logoUrl }]
          if (option.kind === 'admin') return [{ key: 'admin', label: option.label, href: option.href, avatarUrl: null }]
          return []
        }),
      }}
      items={items}
      links={[
        { key: 'public', label: 'View public page', href: `/spaces/${space.slug}` },
        ...(space.domain ? [{ key: 'website', label: 'Your website', href: `https://${space.domain}`, external: true }] : []),
        { key: 'feed', label: 'Feed', href: '/feed' },
        { key: 'events', label: 'Events', href: '/events' },
        { key: 'help', label: 'Help', href: '/help' },
      ]}
      search={{ href: `/spaces/${space.slug}/manage?section=resonance`, label: 'Search people, events' }}
      alerts={{ href: '/notifications', unread }}
      me={{ name: me?.display_name ?? 'You', avatarUrl: me?.avatar_url ?? null, href: '/profile' }}
    >
      {children}
    </AdminShell>
  )
}
