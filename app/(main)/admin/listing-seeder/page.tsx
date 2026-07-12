// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the OPERATOR CONSOLE landing (Wave 1). The home for
// the tool: a start form (pick the vertical, paste the copied listing, add optional
// hints and photos) and the list of seeds by status, newest first.
//
// SERVER COMPONENT (PAGE-FRAMEWORK §5): gates entry (structure:write, the same
// capability every action re-checks), then reads the operator's seeds. Composes the
// kit — AdminTemplate / AdminSection / StatCard — never a hand-rolled layout. The
// interactive form + list live in thin client children.
// ─────────────────────────────────────────────────────────────────────────────

import { ClipboardPaste } from 'lucide-react'
import { redirect } from 'next/navigation'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { getMyProfileId } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { staffCan } from '@/lib/core/staff-roles'
import { listListingIntakes } from './actions'
import { StartImportForm } from './start-import-form'
import { IntakeList } from './intake-list'

export const dynamic = 'force-dynamic'

export default async function ListingSeederPage() {
  // Gate entry: structure:write, matching the business seeder. Redirect home when unauthorized
  // (never a 404 dead end), mirroring requireStaffCap's posture.
  const member = await getStaffMember().catch(() => null)
  if (!member || !staffCan(member.role, 'structure', 'write')) redirect('/')
  const operatorId = await getMyProfileId()
  if (!operatorId) redirect('/')

  const intakes = await listListingIntakes()

  const counts = {
    review: intakes.filter((i) => i.status === 'review').length,
    applied: intakes.filter((i) => i.status === 'applied').length,
    failed: intakes.filter((i) => i.status === 'failed').length,
  }

  return (
    <AdminTemplate
      title="Listing Seeder"
      eyebrow="Operations"
      icon={ClipboardPaste}
      description="Paste a classifieds or housing listing you copied, add any photos, and Frequency extracts the fields for you to review and publish. Every seeded listing is held by Frequency until the original poster claims it."
      width="wide"
    >
      <AdminSection title="Seed a listing" description="Pick the vertical, paste the copy, and add any photos. Frequency does the rest.">
        <StartImportForm />
      </AdminSection>

      <AdminSection title="At a glance" description="Where your seeds are in the pipeline.">
        <div className="grid grid-cols-3 gap-3">
          <StatCard bordered label="⚠️ In review" value={counts.review} detail="need your review" href="#seeds" />
          <StatCard bordered label="✅ Published" value={counts.applied} detail="live and claimable" />
          <StatCard bordered label="🔴 Failed" value={counts.failed} detail="recoverable" />
        </div>
      </AdminSection>

      <div id="seeds" className="scroll-mt-24">
        <AdminSection title="Seeds" description="Newest first. Open one to review its fields and publish it.">
          <IntakeList intakes={intakes} />
        </AdminSection>
      </div>
    </AdminTemplate>
  )
}
