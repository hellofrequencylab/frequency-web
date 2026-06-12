import { Menu } from 'lucide-react'
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { NAV_AREA_DEFAULTS } from '@/lib/nav-areas'
import { getMenuConfig, orderedVisibleAreas } from '@/lib/menu-config'
import { getAreaPermissions } from '@/lib/permissions'
import { PermissionGrid } from '../roles/permission-grid'
import { MenuSorter } from './menu-sorter'

export const dynamic = 'force-dynamic'

// The GLOBAL menu manager (janitor-only). ONE shared rail for everyone — the
// operator sets the order and per-item visibility here (menu_config), and per-ROLE
// access is surfaced via the existing PermissionGrid (area_permissions), so the two
// concerns live side by side: "the exact same menu everywhere, with specific
// visibility per user role."
export default async function AdminMenuPage() {
  await requireAdmin('janitor')

  // The current global config, applied the same way the live rail applies it: the
  // sorter hydrates from the ordered + visibility-resolved area list so the editor
  // matches what members see. Best-effort — empty config (code defaults) on error.
  const config = await getMenuConfig()
  // Show EVERY area in the editor (visible ones in their saved order, then any hidden
  // ones) so the operator can re-show a hidden item. Order: visible-in-order first,
  // hidden appended in code order.
  const visible = orderedVisibleAreas(config)
  const hiddenAreas = Object.keys(NAV_AREA_DEFAULTS).filter((k) => config.hidden.has(k))
  const initialOrder = [...visible.map((a) => a.key), ...hiddenAreas]
  const initialHidden = [...config.hidden]

  const permissions = await getAreaPermissions()

  return (
    <AdminTemplate
      title="Menu manager"
      eyebrow="Platform"
      icon={Menu}
      description="The one shared navigation menu, the same for everyone. Set its order and hide items globally, then tune who can reach each one by role."
      width="default"
    >
      <AdminSection
        title="Order & visibility"
        description="Drag to set the global order of the left rail, and hide any item to remove it for everyone. This is the single menu every member sees."
      >
        <MenuSorter initialOrder={initialOrder} initialHidden={initialHidden} />
      </AdminSection>

      <AdminSection
        title="Role permissions"
        description="Set the lowest role that can reach each item. Hidden items are gone for everyone; the rest follow these per-role rules. The same grid lives on Roles & permissions."
        actions={
          <Link
            href="/admin/roles"
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            Open Roles & permissions
          </Link>
        }
      >
        <PermissionGrid initial={permissions} defaults={NAV_AREA_DEFAULTS} />
      </AdminSection>
    </AdminTemplate>
  )
}
