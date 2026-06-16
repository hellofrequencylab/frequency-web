import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'

// The Journey curation surface (absorbs the old /admin/quests). Module-driven (ADR-270/294): the
// page gates access + composes the shared header, then renders <PageModules>, which lays out the
// curation blocks (the stat band, the member-submission review queue, the ranked public library)
// in the operator-chosen template + order. Staff arrange it from the on-page Settings → Layout
// panel (the route is registered in lib/widgets/module-routes.ts so the panel appears here); each
// block is a self-fetching RSC in components/widgets/admin/* reading the shared journeys context.
export default async function AdminContentJourneysPage() {
  await requireAdmin('host', { staff: 'community' })

  return (
    <AdminTemplate
      title="Journeys"
      eyebrow="Content"
      description="The open Journey library. Review member submissions, mark Journeys official under a Quest, and feature the best."
      width="wide"
      actions={
        <Link
          href="/admin/content/journeys/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" /> Add journey
        </Link>
      }
    >
      <PageModules route="/admin/content/journeys" />
    </AdminTemplate>
  )
}
