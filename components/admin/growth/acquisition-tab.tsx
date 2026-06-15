import { AdminSection } from '@/components/templates'
import { AdminAreaSections } from '@/components/admin/admin-area-grid'
import { RelatedAreas } from '@/components/admin/related-areas'
import { groupSections } from '@/app/(main)/admin/sections'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// The "Acquisition" tab of the consolidated Growth workspace (ADR-264) — formerly
// /admin/acquisition. Entry points + QR, onboarding splash + sequences, walkthroughs.
// Each linked surface keeps its own gate; this just lists the ones the viewer can reach.
export async function AcquisitionTab({
  role,
  webRole,
  staffRole,
}: {
  role: CommunityRole
  webRole: WebRole
  staffRole: StaffRole | null
}) {
  const sections = groupSections('acquisition', role, webRole, staffRole)

  return (
    <>
      <AdminSection title="Work in Acquisition" description="Every surface in this domain you can reach.">
        <AdminAreaSections sections={sections} />
      </AdminSection>

      <RelatedAreas current="acquisition" role={role} webRole={webRole} staffRole={staffRole} />
    </>
  )
}
