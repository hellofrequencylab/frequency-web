import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// MODERATION — the community report queue, module-driven (ADR-270/294): the page owns the
// AdminTemplate header, then renders <PageModules>, which lays out the report queue as one
// self-fetching, fail-safe RSC (components/widgets/admin/admin-moderation-queue.tsx). The interior
// has no searchParams facet — it reads the pending reports and their target previews itself — so it
// converts wholesale to one module. requireAdmin('host', { staff: 'community' }) gates the whole
// route; the module renders only through it and never re-gates.
export default async function ModerationPage() {
  await requireAdmin('host', { staff: 'community' })

  return (
    <AdminTemplate
      title="Moderation"
      eyebrow="Community"
      description="Review reports submitted by community members, ranked newest first. Acting on a report resolves it; dismissed reports are hidden but not deleted."
      width="wide"
    >
      <PageModules route="/admin/moderation" />
    </AdminTemplate>
  )
}
