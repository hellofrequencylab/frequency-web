import { Bot } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { AdminAreaSections } from '@/components/admin/admin-area-grid'
import { RelatedAreas } from '@/components/admin/related-areas'
import { groupSections } from '../sections'

// Vera AI — the assistant and the intelligence behind it (ADR-233 IA): Vera's voice +
// the help gaps she surfaces, the platform AI controls, and the recommendations + read
// she generates. Pulled out of Operations into its own area. Gate: janitor / insights
// staff; each linked surface keeps its own gate.
export default async function VeraAiDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('janitor', { staff: 'insights' })
  const sections = groupSections('vera-ai', role, webRole, staffRole)

  return (
    <AdminTemplate
      title="Vera AI"
      eyebrow="Domain"
      icon={Bot}
      width="wide"
      description="The assistant and the intelligence behind it. Vera's voice and gaps, the platform AI controls, and the recommendations and read she generates."
    >
      <AdminSection title="Work in Vera AI" description="Every surface in this domain you can reach.">
        <AdminAreaSections sections={sections} />
      </AdminSection>

      <RelatedAreas current="vera-ai" role={role} webRole={webRole} staffRole={staffRole} />
    </AdminTemplate>
  )
}
