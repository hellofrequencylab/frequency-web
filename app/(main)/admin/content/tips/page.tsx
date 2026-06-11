import { Sparkles, Send, Inbox, Flag } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { listTips } from '@/lib/ai/creator-tips'
import { GenerateTipsButton, GeneratePosterReviewsButton, TipDraftCard, FlagReviewCard } from './tips-queue'

// Vera's creator-tips queue (janitor only). Vera drafts engagement tips for the
// creators of top-performing member content, and poster reviews (coaching tips
// or internal spam flags) for event posters whose pattern needs attention.
// Nothing reaches a member until an admin reviews, edits, and sends it here;
// flags never reach the member at all.

export default async function AdminContentTipsPage() {
  await requireAdmin('janitor')

  const [live, sent] = await Promise.all([
    listTips(['draft', 'approved']),
    listTips(['sent'], 50),
  ])

  // A flag with status 'approved' has been reviewed: it leaves the queue but
  // stays visible below as a record. Tips stay queued until sent or dismissed.
  const queue = live.filter((t) => !(t.kind === 'flag' && t.status === 'approved'))
  const reviewedFlags = live.filter((t) => t.kind === 'flag' && t.status === 'approved')

  return (
    <AdminPage
      title="Vera's tips"
      eyebrow="Content"
      description="Vera reads the performance signals and drafts one engagement tip per creator, plus poster reviews for town-event posters. Review, edit, and send, or dismiss. Nothing goes out without your approval."
      width="default"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <GeneratePosterReviewsButton />
          <GenerateTipsButton />
        </div>
      }
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Waiting for review" value={queue.length} icon={Inbox} />
          <StatCard label="Sent" value={sent.length} icon={Send} />
        </div>
      </AdminSection>

      <AdminSection
        title={`Drafts (${queue.length})`}
        description="Each draft is grounded in real numbers. Edit tips freely before sending. Tips coach genuine posters. Flags are internal; the honesty bands already throttle the reward."
      >
        {queue.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No drafts waiting"
            description="Use Generate tips for the top performers, or Generate poster reviews for event posters whose pattern needs attention. Anything already covered is skipped."
          />
        ) : (
          <div className="space-y-3">
            {queue.map((t) =>
              t.kind === 'flag' ? (
                <FlagReviewCard
                  key={t.id}
                  id={t.id}
                  draftText={t.draft_text}
                  posterName={t.creator?.display_name ?? t.creator?.handle ?? 'Unknown member'}
                  evidence={t.evidence}
                  createdAt={t.created_at}
                />
              ) : (
                <TipDraftCard
                  key={t.id}
                  id={t.id}
                  draftText={t.draft_text}
                  contentType={t.content_type}
                  creatorName={t.creator?.display_name ?? t.creator?.handle ?? 'Unknown member'}
                  evidence={t.evidence}
                  createdAt={t.created_at}
                />
              ),
            )}
          </div>
        )}
      </AdminSection>

      {reviewedFlags.length > 0 && (
        <AdminSection
          title={`Reviewed flags (${reviewedFlags.length})`}
          description="Internal notes you marked reviewed. The member never sees these."
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="divide-y divide-border/50">
              {reviewedFlags.map((t) => (
                <div key={t.id} className="px-4 py-3">
                  <p className="flex items-center gap-1.5 text-xs text-subtle">
                    <Flag className="h-3 w-3 text-warning" aria-hidden />
                    {t.creator?.display_name ?? t.creator?.handle ?? 'Unknown member'} · posted events
                    {typeof t.evidence?.band === 'string' ? ` · band: ${t.evidence.band}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-text">{t.draft_text}</p>
                </div>
              ))}
            </div>
          </div>
        </AdminSection>
      )}

      <AdminSection title={`Sent (${sent.length})`} description="What actually went out, newest first.">
        {sent.length === 0 ? (
          <p className="text-sm text-muted">Nothing sent yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="divide-y divide-border/50">
              {sent.map((t) => (
                <div key={t.id} className="px-4 py-3">
                  <p className="text-xs text-subtle">
                    To {t.creator?.display_name ?? t.creator?.handle ?? 'Unknown member'} · about{' '}
                    {typeof t.evidence?.title === 'string'
                      ? `"${t.evidence.title}"`
                      : t.content_type === 'event'
                        ? 'their posted events'
                        : `a ${t.content_type}`}{' '}
                    · {t.sent_at ? new Date(t.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </p>
                  <p className="mt-1 text-sm text-text">{t.sent_text ?? t.draft_text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </AdminSection>
    </AdminPage>
  )
}
