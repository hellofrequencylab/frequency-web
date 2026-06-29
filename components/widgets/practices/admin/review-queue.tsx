import { listReviewQueue } from '@/lib/practices/clean'
import { SectionHeader } from '@/components/ui/section-header'
import { ReviewQueuePanel, type ReviewRow } from './review-queue-panel'

// Practice library — Phase 2 "Clean" review queue (ADR-438, PRACTICE-LIBRARY §6 item 2.1).
//
// Self-fetching async RSC: reads the triage queue (listReviewQueue) and hands plain rows to a
// thin client panel that owns selection, the bulk approve/reject bar, the per-row decision, and
// the advisory Vera pre-screen. Returns null when the queue is empty, so "assigned but nothing
// to review" costs one query and renders nothing (the module contract; PAGE-FRAMEWORK §4.1).
// Replaces the basic pending-list section on the admin practices page; built self-contained so
// the block-area agent can register it as a layout module (ADR-270/272) without a rewrite.

export async function PracticeReviewQueue() {
  const items = await listReviewQueue({ limit: 50 })
  if (items.length === 0) return null

  const rows: ReviewRow[] = items.map((it) => ({
    id: it.id,
    title: it.title,
    creator: it.creator?.display_name ?? it.creator?.handle ?? 'Frequency',
    isHouse: it.created_by == null,
    submitterTrust: it.submitterTrust,
    updatedAt: it.updated_at ?? it.created_at,
    possibleDuplicateOf: it.possibleDuplicateOf,
  }))

  return (
    <section className="space-y-3">
      <SectionHeader title="Review queue" count={rows.length} />
      <ReviewQueuePanel rows={rows} />
    </section>
  )
}
