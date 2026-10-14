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

/** The hub tabs as sidebar rows, each claiming its catalog rows' pages. PURE. */
export function spaceNavItems(slug: string, editor: boolean): AdminNavItem[] {
  const base = `/spaces/${slug}`
  const items: AdminNavItem[] = SPACE_HUB_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    href: section.key === 'dashboard' ? `${base}/manage` : `${base}/manage?section=${section.key}`,
    icon: SECTION_ICON[section.key],
    match: SPACE_MODULES.flatMap((module) => {
      if (sectionForModule(module) !== section.key || !module.deepLink) return []
      const path = module.deepLink(slug).split('#')[0]
      return path === `${base}/manage` ? [] : [path]
    }),
  }))
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
