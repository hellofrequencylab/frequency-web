import { Menu } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

export const dynamic = 'force-dynamic'

// The DB-backed Menu Manager (janitor-only). Module-driven (ADR-270/294): the page gates entry
// and composes the shared admin header, then renders <PageModules>, which lays out the navigation
// editor block in the operator-chosen template + order. The editor itself is the `menu-manager`
// module (components/widgets/menu/menu-manager-block.tsx) — a self-fetching RSC that reads every
// surface's resolved menu plus the global speed settings server-side and hands them to the client
// builder. Staff arrange the page from the on-page Settings → Layout panel (the route is registered
// in lib/widgets/module-routes.ts, so the panel appears here). Reads stay best-effort inside the
// module: getAdminMenu falls back to the code defaults per surface, so the page always renders
// something editable.
export default async function AdminMenuPage() {
  await requireAdmin('janitor')

  return (
    <AdminTemplate
      title="Menu manager"
      eyebrow="Platform"
      icon={Menu}
      description="Build every navigation surface: its groups and links, how they sit in columns, who can reach each one, and the featured cards beside them."
      width="wide"
    >
      <PageModules route="/admin/menu" />
    </AdminTemplate>
  )
}
