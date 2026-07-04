import { AdminSection } from '@/components/templates'
import { CockpitMemberViewer } from '@/app/(main)/admin/crm/cockpit-member-viewer'

// Resonance CRM layout module (LP7, ADR-270/294): the member-viewer block — the cockpit's front door
// (ADR-459). The whole scored roster (10 rows, most-recent first) with the hero sort + live search.
// Self-fetching RSC; the page owns the janitor gate, so this never re-gates. Its own <Suspense> boundary
// (the page-module renderer) so a slow roster read never blocks the cockpit stats below.
export async function CrmMembers() {
  return (
    <AdminSection
      title="Members"
      description="Everyone the engine has scored. Search, re-sort, and open anyone to see their roles, funnels, pipeline, and recent touches."
    >
      <CockpitMemberViewer />
    </AdminSection>
  )
}
