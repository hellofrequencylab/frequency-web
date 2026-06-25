import Link from 'next/link'
import { Menu, LayoutGrid } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { buttonClasses } from '@/components/ui/button'
import { resolvePageContent } from '@/lib/page-content'

export const dynamic = 'force-dynamic'

// Coded fallback for the operator-editable header subtitle (ADR-180/359). The Settings → Subtitle
// editor overrides only the description; everything else (title, chrome) stays coded.
const CONTENT_FALLBACK = {
  title: 'Menu manager',
  description:
    'Build every navigation surface: its groups and links, how they sit in columns, who can reach each one, and the featured cards beside them.',
}

// The DB-backed Menu Manager (janitor-only). Module-driven (ADR-270/294/359): the page gates entry
// and composes the shared admin header, then renders <PageModules>, which lays out the FIVE
// navigation-editor blocks in the operator-chosen template + order: menu-surface (the surface
// picker, the only thing that sets the active surface), menu-groups (the bulk editor), menu-speed
// (global timings), menu-layout (columns + seed/reset), and menu-rail-cards (the featured side
// cards). Each is a self-fetching RSC; the surface-scoped four resolve the active surface through
// the x-search seam (lib/menus/active-surface), so the picker re-scopes them all in lock-step.
// Staff arrange the page from the on-page Settings → Layout panel (the route is registered in
// lib/widgets/module-routes.ts, so the panel appears here, trimmed to Subtitle + Layout on /admin).
// Reads stay best-effort inside each block: getAdminMenu falls back to the code defaults per
// surface, so the page always renders something editable.
export default async function AdminMenuPage() {
  await requireAdmin('janitor')

  // Operator-editable header subtitle (ADR-180) — falls back to the coded line.
  const { description } = await resolvePageContent('/admin/menu', CONTENT_FALLBACK)

  return (
    <AdminTemplate
      title="Menu manager"
      eyebrow="Platform"
      icon={Menu}
      description={description}
      width="wide"
    >
      <div className="mb-5">
        <Link href="/admin/menu/arrange" className={buttonClasses('secondary', 'sm')}>
          <LayoutGrid className="h-4 w-4" aria-hidden />
          Visual arranger
        </Link>
      </div>
      <PageModules route="/admin/menu" />
    </AdminTemplate>
  )
}
