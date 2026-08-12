// ─────────────────────────────────────────────────────────────────────────────
// THE EVENT SEEDER — the REVIEW BOARD route (ADR-989). One staged event, rendered field by
// field from the EVENT MANIFEST through the Studio kernel: each field's value, the message it
// was read from, and a ✅/⚠️/🔴 signal. The operator edits, confirms, or drops per field, then
// seeds it as an unlisted event draft.
//
// SERVER COMPONENT: gates entry, loads the review, and hands it to a thin client board for the
// interactions. A missing or unreadable row shows a clear state, never a crash.
// ─────────────────────────────────────────────────────────────────────────────

import { CalendarDays } from 'lucide-react'
import { AdminTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { requireAdmin } from '@/lib/admin/guard'
import { getStagedEventReview } from '../actions'
import { STATUS_META } from '../intake-list'
import { ReviewBoard } from './review-board'

export const dynamic = 'force-dynamic'

export default async function StagedEventReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('admin', { staff: 'community', staffLevel: 'write' })

  const { id } = await params
  const review = await getStagedEventReview(id)
  const back = { href: '/admin/event-seeder', label: 'Event Seeder' }

  if (!review) {
    return (
      <AdminTemplate title="Staged event not found" eyebrow="Event Seeder" icon={CalendarDays} back={back}>
        <EmptyState
          variant="error"
          title="This one could not be loaded"
          description="It may have been removed, or it belongs to another operator. Head back to the list and pick another."
        />
      </AdminTemplate>
    )
  }

  const meta = STATUS_META[review.status]

  return (
    <AdminTemplate
      title={review.title}
      eyebrow="Event Seeder"
      icon={CalendarDays}
      description={`${meta.glyph} ${meta.label} · ${review.source}`}
      back={back}
      width="wide"
    >
      <ReviewBoard
        intakeId={review.id}
        status={review.status}
        initialModel={review.model}
        door={review.door}
        note={review.note}
        sourceText={review.sourceText}
        imageNames={review.imageNames}
        posterUrl={review.posterUrl}
        targetEventId={review.targetEventId}
        error={review.error}
      />
    </AdminTemplate>
  )
}
