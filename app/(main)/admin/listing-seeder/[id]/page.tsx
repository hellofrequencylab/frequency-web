// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the REVIEW BOARD route (Wave 1). One seed: renders
// the extracted draft FIELD BY FIELD with its value, its provenance (fact / inferred /
// generated badge + cited snippet from the ledger), inline editing, a photo strip, and
// a Publish button. After publish it shows the claim URL the operator sends the poster.
//
// SERVER COMPONENT: gates entry (structure:write), loads the review model, and hands it
// to a thin client board. A missing / unreadable seed shows a clear state, never a crash.
// ─────────────────────────────────────────────────────────────────────────────

import { redirect } from 'next/navigation'
import { ClipboardPaste } from 'lucide-react'
import { AdminTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getStaffMember } from '@/lib/staff'
import { staffCan } from '@/lib/core/staff-roles'
import { getListingIntakeReview } from '../actions'
import { LISTING_STATUS_META } from '../intake-list'
import { ReviewBoard } from './review-board'

export const dynamic = 'force-dynamic'

export default async function ListingSeedReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await getStaffMember().catch(() => null)
  if (!member || !staffCan(member.role, 'structure', 'write')) redirect('/')

  const { id } = await params
  const review = await getListingIntakeReview(id)

  const back = { href: '/admin/listing-seeder', label: 'Listing Seeder' }

  if (!review) {
    return (
      <AdminTemplate title="Seed not found" eyebrow="Listing Seeder" icon={ClipboardPaste} back={back} width="default">
        <EmptyState
          variant="error"
          title="This seed could not be loaded"
          description="It may have been removed. Head back to the console and pick another."
        />
      </AdminTemplate>
    )
  }

  const meta = LISTING_STATUS_META[review.status]

  // Not yet reviewable (still extracting or failed): show an honest state, not an empty board.
  if (review.status !== 'review' && review.status !== 'applied') {
    return (
      <AdminTemplate
        title={review.title}
        eyebrow="Listing Seeder"
        icon={ClipboardPaste}
        description={`${meta.glyph} ${meta.label}`}
        back={back}
        width="default"
      >
        {review.status === 'failed' ? (
          <EmptyState
            variant="error"
            title="The extract could not finish"
            description={review.error ?? 'A step errored. It is recoverable — start the seed again from the console.'}
          />
        ) : (
          <EmptyState
            title="Extracting the fields"
            description="Frequency is reading the paste. Refresh in a moment to review the draft."
          />
        )}
      </AdminTemplate>
    )
  }

  return (
    <AdminTemplate
      title={review.title}
      eyebrow="Listing Seeder"
      icon={ClipboardPaste}
      description="Check each field against the paste, edit what needs it, then publish. The listing is held by Frequency until the poster claims it with the link you send them."
      back={back}
      width="wide"
    >
      <ReviewBoard
        intakeId={review.id}
        kind={review.kind}
        status={review.status}
        initialModel={review.model}
        initialImages={review.images}
        appliedListingId={review.appliedListingId}
      />
    </AdminTemplate>
  )
}
