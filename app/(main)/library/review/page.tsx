import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Inbox } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { FocusTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getInitials, relativeTime } from '@/lib/utils'
import { getPendingReview, typeLabel } from '@/lib/library'
import { ReviewActions } from './review-actions'

export const dynamic = 'force-dynamic'

// Leadership review queue — a circle Host or any Guide+ approves community
// submissions (practices, programs, journeys) into the Library (ADR-109).
export default async function LibraryReviewPage() {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) redirect('/library')

  const pending = await getPendingReview()

  return (
    <FocusTemplate
      title="Review queue"
      description="Community submissions waiting to join the Library. Approve to publish into the pool; reject to send back."
      back={{ href: '/library', label: 'Library' }}
    >
      {pending.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing to review" description="When members submit practices, programs, or journeys, they'll line up here." />
      ) : (
        <ul className="space-y-3">
          {pending.map((p) => (
            <li key={`${p.contentType}:${p.id}`} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-semibold text-muted">{typeLabel(p.contentType)}</span>
                  <span className="text-xs text-subtle">{relativeTime(p.createdAt)}</span>
                </div>
                <h3 className="mt-1 text-base font-bold text-text">{p.title}</h3>
                {p.summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{p.summary}</p>}
                {p.author && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-subtle">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-bg text-3xs font-semibold text-primary-strong">
                      {getInitials(p.author.display_name)}
                    </span>
                    by {p.author.display_name}
                  </div>
                )}
              </div>
              <ReviewActions type={p.contentType} id={p.id} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-subtle">
        <Link href="/library" className="inline-flex items-center gap-1 text-primary-strong hover:underline">
          <ChevronLeft className="h-3 w-3" /> Back to the Library
        </Link>
      </p>
    </FocusTemplate>
  )
}
