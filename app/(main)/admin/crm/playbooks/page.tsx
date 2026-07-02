import { Workflow } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { PageModules } from '@/components/widgets/page-modules'
import { seedPlaybooks } from '@/lib/playbooks/seed'

// PLAYBOOKS, the registry of saved Vera plays + their run history (Resonance Engine · ADR-389 ·
// docs/ADMIN-BUILD-PLAN.md Phase 3a · docs/NEXT-GEN-CRM.md "prediction -> playbook -> action").
// Module-driven (ADR-270/294): the page composes the AdminTemplate header + keeps the idempotent
// seed sync, then renders <PageModules>, which lays out the stat band, the code-registry table, and
// the recent run history in the operator-chosen order. Each block is a self-fetching RSC in
// components/widgets/crm/* isolated in its own <Suspense>, so a slow read never blocks the shell and
// staff arrange them from the on-page Settings → Layout panel.
//
// STAFF-GATED (requireAdmin('janitor')) like the rest of the Resonance CRM domain: a playbook governs
// member-facing actions, so the registry is a sensitive operator view. The modules render only through
// this gated route, so they never re-gate. The /admin/* group mounts its own info rail (page-chrome
// returns 'none' for /admin/*), so no rail registration is needed here.
//
// READ-ONLY for v1: the catalog + history are shown; running a play and toggling autonomy live behind
// the existing governed execute path + the per-Space slider (not exposed on this page). The autonomy
// engine defaults to SUGGEST ONLY platform-wide. Every read is fail-safe (zeros / empty) so the page
// degrades to a calm empty state, never a crash. Semantic tokens only; copy in voice (no em or en dashes).
export const dynamic = 'force-dynamic'

export default async function PlaybooksPage() {
  await requireAdmin('janitor')

  // Keep the durable `playbooks` table in sync with the CODE registry (the source of truth). Idempotent
  // + fail-safe: a re-run is a no-op, and a missing table / write error degrades silently (the code
  // registry still drives everything). This is the seam that populates the formerly-empty prod table.
  await seedPlaybooks()

  return (
    <AdminTemplate
      title="Playbooks"
      eyebrow="CRM"
      icon={Workflow}
      description="The saved Vera plays: each binds one prediction to one governed, reversible action. Vera drafts, you approve. Nothing member-facing ever fires on its own."
      width="wide"
    >
      <PageModules route="/admin/crm/playbooks" />
    </AdminTemplate>
  )
}
