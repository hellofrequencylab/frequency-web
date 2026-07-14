import { Sparkles, Upload, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { EmptyState } from '@/components/ui/empty-state'
import { listImportSpaces } from '@/lib/crm/import/actions'
import { ImportWizard } from '@/components/crm/import/import-wizard'

// RESONANCE CRM — ALTITUDE 1, the Platform Resonance CRM (Resonance Engine Phase 2 · ADR-383 · ADR-459
// · docs/NEXT-GEN-CRM.md "The brilliant admin dashboard"). Module-driven (ADR-270/294): the page
// composes the AdminTemplate header, then renders <PageModules>, which lays out the VIEWER-FIRST member
// block (the scored roster + hero sort + live search), then the health cockpit (the computed verdict,
// the LIVE StatCard row, the who-needs-attention worklist, the lifecycle funnel), the rising-members
// pool, and the score-trustworthiness backtest, in the operator-chosen order. Each block is a
// self-fetching, fail-safe RSC in components/widgets/crm/* isolated in its own <Suspense>, so a slow
// read never blocks the shell (PAGE-FRAMEWORK §5) and every read degrades to a calm empty, never a crash.
//
// IMPORT VIEW (?view=import): Frequency's own CSV contact importer lives INSIDE this CRM, not a standalone
// page. It reuses the shared wizard (components/crm/import/*), scoped to the platform operator's managed
// Space contact lists (listImportSpaces). Contacts land as unknown/unsubscribed leads (ADR-099), sealed to
// the chosen Space by the membrane, never shared to the wider community.
//
// STAFF-GATED: requireAdmin('janitor') — a platform-wide member-health read is a sensitive operator
// view. The modules render only through this gated route, so they never re-gate. The member drilldowns
// live on /admin/crm/members (out of this page's scope). The /admin/* group mounts its own info rail
// (page-chrome 'none'), so no rail registration is needed here.
export const dynamic = 'force-dynamic'

export default async function PlatformCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>
}) {
  await requireAdmin('janitor')

  const { view } = await searchParams
  const activeView = (Array.isArray(view) ? view[0] : view) ?? null

  if (activeView === 'import') {
    const spaces = await listImportSpaces()
    return (
      <AdminTemplate
        title="Import contacts"
        eyebrow="CRM"
        icon={Upload}
        description="Upload a CSV to bring contacts into one of your Space contact lists. We match your columns to the right fields, dedupe against what the Space already has, and show a preview before anything is saved. Imported contacts are leads, never auto-subscribed."
        width="wide"
        actions={
          <Link
            href="/admin/crm"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to CRM
          </Link>
        }
      >
        <AdminSection>
          {spaces.length === 0 ? (
            <EmptyState
              icon={Upload}
              variant="first-use"
              title="No Space contact list to import into yet"
              description="Contacts import into a Space's own sealed list. Once you run a Space with a contact list, choose it here and bring a CSV in."
            />
          ) : (
            <div className="max-w-2xl">
              <ImportWizard targetKind="space" spaces={spaces} />
            </div>
          )}
        </AdminSection>
      </AdminTemplate>
    )
  }

  return (
    <AdminTemplate
      title="Resonance CRM"
      eyebrow="CRM"
      icon={Sparkles}
      description="Your whole scored roster up top, sorted by who joined most recently. The health read for the platform sits below."
      width="wide"
      actions={
        <Link
          href="/admin/crm?view=import"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
        >
          <Upload className="h-4 w-4" aria-hidden /> Import contacts
        </Link>
      }
    >
      <PageModules route="/admin/crm" />
    </AdminTemplate>
  )
}
