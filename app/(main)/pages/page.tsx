import { Files } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

export const dynamic = 'force-dynamic'

// The Pages workspace — the page index: every page the platform serves, most important first, with
// what produces each one and the one action that is true for it (ADR-1763). MODULE-DRIVEN
// (ADR-270/294): the five lists (Site pages, Lead and SEO pages, Funnels, In-app pages, System pages)
// are self-fetching layout modules (lib/widgets/modules.ts → registry) laid out by
// <PageModules route="/pages">; operators arrange them from the on-page Settings → Layout panel (the
// route is registered in lib/widgets/module-routes.ts). The public lists draw from
// lib/pages/index-catalog.ts; every list renders for every operator, and only a janitor gets the
// Edit buttons, so a Site Admin reads the whole index and never lands in a gated editor.
export default async function PagesDirectory() {
  // Page management is STAFF (admin+, ADR-261/262); each module re-asserts its own minimum.
  await requireAdmin('admin')

  return (
    <AdminTemplate
      title="Pages"
      eyebrow="Platform"
      icon={Files}
      description="Every page in one index, most important first. Edit opens the block editor on the pages it builds; the other pages say where their content comes from."
      width="wide"
    >
      <PageModules route="/pages" />
    </AdminTemplate>
  )
}
