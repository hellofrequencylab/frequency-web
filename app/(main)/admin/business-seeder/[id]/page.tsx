// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the REVIEW BOARD route (P3, docs/BUSINESS-IMPORTER.md §4/§8).
// One import: renders the extracted + reframed draft FIELD BY FIELD with its value, its
// provenance (citation snippet + source link, one click), and its confidence as a ✅/⚠️/🔴
// signal from the ledger. The operator edits inline, confirms, or drops per field, then
// approves -> Apply (an unlisted demo Space).
//
// SERVER COMPONENT: gates entry (structure:write), loads the review model, and hands it to a
// thin client board for the interactions. A degraded / erroring / missing intake shows a clear
// state (EmptyState), never a crash (docs §7 fail-safe).
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { Building2, Loader2 } from 'lucide-react'
import { AdminTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getStaffMember } from '@/lib/staff'
import { staffCan } from '@/lib/core/staff-roles'
import { getBusinessImportReview } from '../actions'
import { STATUS_META } from '../intake-list'
import { ReviewBoard } from './review-board'

export const dynamic = 'force-dynamic'

export default async function BusinessImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await getStaffMember().catch(() => null)
  if (!member || !staffCan(member.role, 'structure', 'write')) redirect('/')

  const { id } = await params
  const review = await getBusinessImportReview(id)

  const back = { href: '/admin/business-seeder', label: 'Business Seeder' }

  if (!review) {
    return (
      <AdminTemplate title="Import not found" eyebrow="Business Seeder" icon={Building2} back={back} width="default">
        <EmptyState
          variant="error"
          title="This import could not be loaded"
          description="It may have been removed, or it belongs to another operator. Head back to the list and pick another."
        />
      </AdminTemplate>
    )
  }

  const meta = STATUS_META[review.status]

  // Not yet in review: the research is still running (or queued / failed). Show an honest state
  // rather than an empty board.
  if (review.status !== 'review' && review.status !== 'applied') {
    return (
      <AdminTemplate
        title={review.name}
        eyebrow="Business Seeder"
        icon={Building2}
        description={`${meta.glyph} ${meta.label}`}
        back={back}
        width="default"
      >
        {review.status === 'failed' ? (
          <EmptyState
            variant="error"
            title="Research could not finish"
            description={review.error ?? 'A stage errored. It is recoverable — re-run the import from the list.'}
          />
        ) : (
          <EmptyState
            icon={Loader2}
            title="Researching this business"
            description="Harvesting sources, checking every commercial fact against a citation, then reframing the copy. This page will fill in once a reviewed draft is ready. Refresh in a moment."
          />
        )}
      </AdminTemplate>
    )
  }

  return (
    <AdminTemplate
      title={review.name}
      eyebrow="Business Seeder"
      icon={Building2}
      description="Check each field against its source, edit or confirm what belongs, then approve. Commercial facts stay withheld until a source clears them or you confirm."
      back={back}
      width="wide"
    >
      <ReviewBoard
        intakeId={review.id}
        initialModel={review.model}
        status={review.status}
        isDemo={review.isDemo}
        appliedSpaceId={review.status === 'applied' ? review.targetSpaceId : null}
      />
    </AdminTemplate>
  )
}
