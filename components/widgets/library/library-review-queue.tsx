import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { EmptyState } from '@/components/ui/empty-state'
import { getInitials, relativeTime } from '@/lib/utils'
import { getPendingReview, typeLabel } from '@/lib/library'
import { ReviewActions } from '@/app/(main)/library/review/review-actions'
import { Inbox } from 'lucide-react'

// Library layout module (ADR-270/294): the leadership review queue — community submissions
// (practices, journeys) waiting to join the Library (ADR-109). A self-fetching RSC gated
// to Host+ (returns null for anyone below, the module contract), so the page's redirect stays the
// real gate and an operator placing this block never leaks the queue to a member. The empty state is
// part of the block, so a placed queue always renders a clear "nothing to review" rather than blank.
export async function LibraryReviewQueue() {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) return null

  const pending = await getPendingReview()

  if (pending.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing to review"
        description="When members submit practices or journeys, they'll line up here."
      />
    )
  }

  return (
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
  )
}
