// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the OPERATOR SEEDER CONSOLE landing (P3,
// docs/BUSINESS-IMPORTER.md §8). The one home for the tool: a start form (paste a
// business's URLs + handles + content), an at-a-glance status roll-up, and the list of
// imports by status with the review / apply entry points.
//
// SERVER COMPONENT (PAGE-FRAMEWORK §5): gates entry (requireStaffCap('structure','write')
// via the guard below), then reads the operator's imports. Composes the kit — AdminTemplate
// / AdminSection / StatCard / EntityCard / EmptyState (no hand-rolled layout, semantic tokens
// only). The interactive start form + list actions are a thin client child.
// ─────────────────────────────────────────────────────────────────────────────

import { Building2 } from 'lucide-react'
import { redirect } from 'next/navigation'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { staffCan } from '@/lib/core/staff-roles'
import { listBusinessImports } from './actions'
import { StartImportForm } from './start-import-form'
import { IntakeList } from './intake-list'
import { ReseedSpaceSearch } from './reseed-space-search'

export const dynamic = 'force-dynamic'

export default async function BusinessSeederPage() {
  // Gate entry: structure:write (the same capability every action re-checks). Redirect home
  // when unauthorized (never a 404 dead end), mirroring requireStaffCap's posture.
  const member = await getStaffMember().catch(() => null)
  if (!member || !staffCan(member.role, 'structure', 'write')) redirect('/')
  const operatorId = await getMyProfileId()
  if (!operatorId) redirect('/')

  // Re-seeding ANY active Space is an ADMIN-only power (above the seeder's structure:write); show the
  // Space search only to platform admins (web_role admin / janitor). The action re-checks this too.
  const caller = await getCallerProfile().catch(() => null)
  const isAdmin = caller?.webRole === 'admin' || caller?.webRole === 'janitor'

  const imports = await listBusinessImports()

  const counts = {
    intake: imports.filter((i) => i.status === 'intake').length,
    researching: imports.filter((i) => i.status === 'researching').length,
    review: imports.filter((i) => i.status === 'review').length,
    applied: imports.filter((i) => i.status === 'applied').length,
    failed: imports.filter((i) => i.status === 'failed').length,
  }

  return (
    <AdminTemplate
      title="Business Seeder"
      eyebrow="Operations"
      icon={Building2}
      description="Paste a business's website, social handles, and any content. Frequency researches it, checks every commercial fact against a source, and hands you a reviewed draft to approve. Every seeded Space is an unlisted demo until you flip it live."
      width="wide"
    >
      <AdminSection title="Start an import" description="Give at least a website, some content, or a name to research.">
        <StartImportForm />
      </AdminSection>

      {isAdmin && (
        <AdminSection
          title="Re-seed an existing Space"
          description="Admin only. Search any active Space and open its master profile to re-voice, re-mood, or re-design it."
        >
          <ReseedSpaceSearch />
        </AdminSection>
      )}

      <AdminSection title="At a glance" description="Where your imports are in the pipeline.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard bordered label="⏳ Queued" value={counts.intake} detail="waiting to research" />
          <StatCard bordered label="⏳ Researching" value={counts.researching} detail="harvest and verify" />
          <StatCard bordered label="⚠️ In review" value={counts.review} detail="need your approval" href="#imports" />
          <StatCard bordered label="✅ Applied" value={counts.applied} detail="seeded a Space" />
          <StatCard bordered label="🔴 Failed" value={counts.failed} detail="recoverable" />
        </div>
      </AdminSection>

      <div id="imports" className="scroll-mt-24">
        <AdminSection title="Imports" description="Newest first. Open one in review to check its facts and approve it.">
          <IntakeList imports={imports} />
        </AdminSection>
      </div>
    </AdminTemplate>
  )
}
