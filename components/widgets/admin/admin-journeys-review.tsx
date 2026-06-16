import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { getAdminJourneysContext } from '@/lib/admin/journeys-context'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { JourneyReviewButtons } from '@/app/(main)/admin/content/content-controls'

// Admin Journeys layout module (ADR-270/294): the review queue — member-submitted Journeys
// waiting for a decision, each with its approve/reject controls. Self-fetching RSC; reads the
// shared (request-cached) admin Journeys context.
export async function AdminJourneysReview() {
  const { pending } = await getAdminJourneysContext()

  return (
    <AdminSection
      title={`Review queue (${pending.length})`}
      description="Member-submitted Journeys waiting for a decision."
    >
      {pending.length === 0 ? (
        <EmptyState
          variant="cleared"
          title="Nothing waiting"
          description="New member submissions land here for a decision."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="divide-y divide-border/50">
            {pending.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/journeys/${j.slug}`}
                    className="flex items-center gap-1.5 text-sm font-medium text-text hover:underline"
                  >
                    {j.emoji && <span aria-hidden="true">{j.emoji}</span>}
                    <span className="truncate">{j.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    by {j.author?.display_name ?? j.author?.handle ?? 'Unknown'} · {j.adopt_count} adopted ·{' '}
                    {j.forked_count} remixed
                  </p>
                </div>
                <JourneyReviewButtons id={j.id} />
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminSection>
  )
}
