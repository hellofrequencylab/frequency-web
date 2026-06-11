import { Rocket } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { AdminAreaSections } from '@/components/admin/admin-area-grid'
import { RelatedAreas } from '@/components/admin/related-areas'
import { groupSections } from '../sections'

// Acquisition — how people first arrive and where to open the next door. A growth
// workspace under the Growth roll-up (ADR-233 IA): entry points + QR, onboarding
// splash + sequences, and the expansion signal. Gate: host+ / marketing staff; each
// linked surface keeps its own gate.
export default async function AcquisitionDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'marketing' })
  const sections = groupSections('acquisition', role, webRole, staffRole)

  return (
    <AdminTemplate
      title="Acquisition"
      eyebrow="Domain"
      icon={Rocket}
      width="wide"
      description="How people first arrive, and where to open the next door. Entry points, onboarding, and the expansion signal."
    >
      <AdminSection title="Work in Acquisition" description="Every surface in this domain you can reach.">
        <AdminAreaSections sections={sections} />
      </AdminSection>

      <RelatedAreas current="acquisition" role={role} webRole={webRole} staffRole={staffRole} />
    </AdminTemplate>
  )
}
