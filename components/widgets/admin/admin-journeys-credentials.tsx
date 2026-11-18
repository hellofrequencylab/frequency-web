import Link from 'next/link'
import { HOME_TZ } from '@/lib/time/home-zone'
import { reviewQueue } from '@/lib/courses/credentials'
import { authorizeAction } from '@/lib/admin/guard'
import { getCallerProfile } from '@/lib/auth'
import { courseHref } from '@/lib/courses/tracks'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { CommunityBookDecision } from '@/app/(main)/admin/content/journeys/community-book-decision'

// Admin Journeys layout module: the Community Book queue (owner 2026-11-17, Certified). Each waiting book
// with its holder, its course and the pages they sent, and the certify / return controls. Self-fetching RSC.
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: HOME_TZ })

export async function AdminJourneysCredentials() {
  // The page opens to hosts; a member's Community Book is for Frequency reviewers only (the action's gate).
  try {
    await authorizeAction(await getCallerProfile(), 'admin', 'community')
  } catch {
    return null
  }
  const queue = await reviewQueue()
  return (
    <AdminSection
      title={`Community Books (${queue.length})`}
      description="Sent in for Certified. Read the pages, then certify or send back with a note."
    >
      {queue.length === 0 ? (
        <EmptyState variant="cleared" title="Nothing waiting" description="New Community Books land here for review." />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="divide-y divide-border/50">
            {queue.map((s) => (
              <div key={s.id} className="space-y-3 px-4 py-4">
                <p className="text-body-sm text-text">
                  {s.holder.handle ? (
                    <Link href={`/people/${s.holder.handle}`} className="font-medium hover:underline">
                      {s.holder.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{s.holder.name}</span>
                  )}{' '}
                  ·{' '}
                  <Link href={courseHref(s.courseSlug)} className="hover:underline">
                    {s.courseTitle}
                  </Link>{' '}
                  <span className="text-meta text-muted">· {dateFmt.format(new Date(s.createdAt))}</span>
                </p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-control border border-border bg-canvas p-3 text-meta text-text">
                  {s.body}
                </pre>
                <CommunityBookDecision id={s.id} />
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminSection>
  )
}
