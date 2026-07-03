import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { NewNexusCompose } from '@/components/compose/new-nexus-compose'

// NEXUSES — the editable network roster, module-driven (ADR-270/294): the page owns the AdminTemplate
// header + the "New nexus" compose action, then renders <PageModules>, which lays out the nexus roster
// as one self-fetching, fail-safe RSC (components/widgets/admin/admin-nexuses-roster.tsx). The
// ?edit=<id> deep-link is read inside the module from the x-search request header (the admin-practices-
// library seam), so the interior needs no page prop. The header action keeps its own outpost fetch (the
// compose dropdown). requireAdmin('mentor', { staff: 'structure' }) gates the whole route; the module
// renders only through it and never re-gates.
export default async function AdminNexusesPage() {
  await requireAdmin('mentor', { staff: 'structure' })

  const admin = createAdminClient()
  const { data: outposts } = await admin
    .from('outposts')
    .select('id, name')
    .order('name')

  return (
    <AdminTemplate
      title="Nexuses"
      eyebrow="Structure"
      description="Top-level geographic groupings. Each nexus contains hubs, which contain circles. Assign a mentor to oversee all hubs and circles within."
      actions={<NewNexusCompose outposts={outposts ?? []} />}
      width="wide"
    >
      <PageModules route="/admin/nexuses" />
    </AdminTemplate>
  )
}
