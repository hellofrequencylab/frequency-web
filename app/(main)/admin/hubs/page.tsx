import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { NewHubCompose } from '@/components/compose/new-hub-compose'

// HUBS — the editable network roster, module-driven (ADR-270/294): the page owns the AdminTemplate
// header + the "New hub" compose action, then renders <PageModules>, which lays out the hub roster as
// one self-fetching, fail-safe RSC (components/widgets/admin/admin-hubs-roster.tsx). The ?edit=<id>
// deep-link is read inside the module from the x-search request header (the admin-practices-library
// seam), so the interior needs no page prop. The header action keeps its own nexus fetch (the compose
// dropdown). requireAdmin('guide', { staff: 'structure' }) gates the whole route; the module renders
// only through it and never re-gates.
export default async function AdminHubsPage() {
  await requireAdmin('guide', { staff: 'structure' })

  const admin = createAdminClient()
  const { data: nexuses } = await admin
    .from('nexuses')
    .select('id, name')
    .order('name')

  return (
    <AdminTemplate
      title="Hubs"
      eyebrow="Structure"
      description="Hubs group circles within a nexus. Each hub is contained within a nexus and groups multiple circles. Assign a guide to oversee each hub."
      actions={<NewHubCompose nexuses={nexuses ?? []} />}
      width="wide"
    >
      <PageModules route="/admin/hubs" />
    </AdminTemplate>
  )
}
