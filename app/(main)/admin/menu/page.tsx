import { Menu } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { getAdminMenu, getMenuSettings, MENU_SURFACES } from '@/lib/menus/read'
import type { MenuSurfaceKey, ResolvedMenu } from '@/lib/menus/types'
import { MenuManager } from '@/components/admin/menu/menu-manager'

export const dynamic = 'force-dynamic'

// The DB-backed Menu Manager (janitor-only). Reads every surface's resolved menu plus
// the global speed settings server-side, then hands them to the client builder, which
// drives the full CRUD in lib/menus/actions. Reads are best-effort: getAdminMenu falls
// back to the code defaults per surface, so the page always renders something editable.
export default async function AdminMenuPage() {
  await requireAdmin('janitor')

  const [settings, ...resolved] = await Promise.all([
    getMenuSettings(),
    ...MENU_SURFACES.map((s) => getAdminMenu(s.key)),
  ])

  const menus = MENU_SURFACES.reduce(
    (acc, s, i) => {
      acc[s.key] = resolved[i]
      return acc
    },
    {} as Record<MenuSurfaceKey, ResolvedMenu>,
  )

  return (
    <AdminTemplate
      title="Menu manager"
      eyebrow="Platform"
      icon={Menu}
      description="Build every navigation surface: its groups and links, how they sit in columns, who can reach each one, and the featured cards beside them."
      width="wide"
    >
      <MenuManager surfaces={MENU_SURFACES} menus={menus} settings={settings} />
    </AdminTemplate>
  )
}
