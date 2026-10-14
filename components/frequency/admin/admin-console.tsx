import 'server-only'
import type { ReactNode } from 'react'
import { getMenu } from '@/lib/menus/read'
import { getCachedViewerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOperatorContext } from '@/lib/context/resolve-context'
import { getUnreadCount } from '@/app/(main)/notifications/actions'
import { canSeeMenuItem, flattenCategoryTree, viewerRoleFor, type MenuViewer } from '@/components/layout/menu-role'
import type { ResolvedCategory, ResolvedItem } from '@/lib/menus/types'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import type { FqIconName } from '@/components/frequency/icon'
import { AdminShell } from './admin-shell'
import type { AdminNavItem } from './nav-model'

// THE OPERATOR CONSOLE IN THE FREQUENCY SHELL (/admin, SITE_DESIGN === 'frequency'). The sidebar is the
// admin_header menu (lib/menus/read, the DB override over its code default, which derives from STUDIO_LEAVES,
// a registered catalog): one row per Studio world, landing on the world's own page, and the active world's
// pages beneath it. Every row passes the same two-axis gate the DAWN sub-nav uses (canSeeMenuItem), so a
// link shows only when the viewer can reach it; the pages still re-gate server-side (requireAdmin).
//
// THE MODERATION BADGE is real: the count of pending community reports (the same head-count the DAWN info
// rail reads), shown on whichever visible row lands on /admin/moderation and summed onto its world row.

const MODERATION_HREF = '/admin/moderation'

/** A Studio world's sprite icon, by its label; the menu stores lucide names, the sprite has its own set. */
const WORLD_ICON: Record<string, FqIconName> = {
  overview: 'space',
  community: 'contacts',
  growth: 'chart',
  content: 'lesson',
  'resonance crm': 'standing',
  'vera ai': 'vera',
  platform: 'settings',
}

/** The pending report queue, fail-quiet: a read error shows no badge rather than a wrong one. */
async function pendingReports(): Promise<number> {
  try {
    const { count } = await createAdminClient().from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    return count ?? 0
  } catch {
    return 0
  }
}

/** Project the admin_header categories onto sidebar rows. PURE over its inputs. */
export function adminNavItems(categories: ResolvedCategory[], viewer: MenuViewer, reports: number): AdminNavItem[] {
  const out: AdminNavItem[] = []
  for (const category of categories) {
    // A section shows when any page in it is reachable (ADR-1745). Each item carries its own page's
    // gate, so a section that groups tools by job (Growth holds QR Studio, Platform holds Market) must
    // not hide a tool behind a neighbour's floor.
    const visible = (item: ResolvedItem) => !!item.href && canSeeMenuItem(item, viewer)
    // Each leaf remembers the sub-group it sits in, so the sidebar draws the section's job groups as
    // small headings (ADR-1745: no run of more than seven links without one).
    const groupOf = new Map<string, string>()
    for (const child of category.children) {
      for (const item of flattenCategoryTree(child, visible)) if (child.label) groupOf.set(item.id, child.label)
    }
    const leaves = flattenCategoryTree(category, visible)
    const landing = leaves[0]
    if (!landing) continue
    const label = category.label ?? landing.label
    const badge = (href: string) => (href === MODERATION_HREF && reports > 0 ? reports : undefined)
    out.push({
      key: category.id,
      label,
      href: landing.href,
      icon: WORLD_ICON[label.toLowerCase()] ?? 'compass',
      badge: badge(landing.href),
      children: leaves.slice(1).filter((leaf) => leaf.href !== landing.href).map((leaf) => ({ key: leaf.id, label: leaf.label, href: leaf.href, badge: badge(leaf.href), group: groupOf.get(leaf.id) })),
    })
  }
  return out
}

export async function FrequencyAdminConsole({ profileId, role, webRole, staffRole, children }: {
  profileId: string
  role: CommunityRole
  webRole: WebRole
  staffRole: StaffRole | null
  children: ReactNode
}) {
  const viewer: MenuViewer = { viewerRole: viewerRoleFor({ loggedIn: true, communityRole: role, webRole }), staffRole }
  const [menu, reports, me, contexts, unread] = await Promise.all([
    getMenu('admin_header'),
    pendingReports(),
    getCachedViewerProfile(),
    resolveOperatorContext({ id: profileId, webRole }),
    getUnreadCount().catch(() => 0),
  ])
  const items = adminNavItems(menu.categories, viewer, reports)
  const name = me?.display_name ?? 'You'
  return (
    <AdminShell
      homeHref="/admin"
      crumbRoot="Frequency"
      navLabel="Admin"
      space={{
        name: 'Frequency',
        role: 'Platform · Staff',
        avatarUrl: null,
        switchTo: contexts.available.flatMap((option) => option.kind === 'operator' ? [{ key: option.spaceId, label: option.label, href: option.href, avatarUrl: option.logoUrl }] : []),
      }}
      items={items}
      search={{ href: '/search', label: 'Search people, events' }}
      alerts={{ href: '/notifications', unread }}
      me={{ name, avatarUrl: me?.avatar_url ?? null, href: '/profile' }}
    >
      {children}
    </AdminShell>
  )
}
