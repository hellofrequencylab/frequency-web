import { Sparkles, Send, Inbox } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { listTips } from '@/lib/ai/creator-tips'
import { GenerateTipsButton, TipDraftCard } from './tips-queue'

// Vera's creator-tips queue (janitor only). Vera drafts engagement tips for the
// creators of top-performing member content; nothing reaches a member until an
// admin reviews, edits, and sends it here.

export default async function AdminContentTipsPage() {
  await requireAdmin('janitor')

  const [drafts, sent] = await Promise.all([
    listTips(['draft', 'approved']),
    listTips(['sent'], 50),
  ])

  return (
    <AdminPage
      title="Vera's tips"
      eyebrow="Content"
      description="Vera reads the performance signals and drafts one engagement tip per creator. Review, edit, and send, or dismiss. Nothing goes out without your approval."
      width="default"
      actions={<GenerateTipsButton />}
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Waiting for review" value={drafts.length} icon={Inbox} />
          <StatCard label="Sent" value={sent.length} icon={Send} />
        </div>
      </AdminSection>

      <AdminSection
        title={`Drafts (${drafts.length})`}
        description="Each draft is grounded in the content's real numbers. Edit the text freely before sending."
      >
        {drafts.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No drafts waiting"
            description="Use Generate tips to have Vera review the top performers. Content that already has a tip is skipped."
          />
        ) : (
          <div className="space-y-3">
            {drafts.map((t) => (
              <TipDraftCard
                key={t.id}
                id={t.id}
                draftText={t.draft_text}
                contentType={t.content_type}
                creatorName={t.creator?.display_name ?? t.creator?.handle ?? 'Unknown member'}
                evidence={t.evidence}
                createdAt={t.created_at}
              />
            ))}
          </div>
        )}
      </AdminSection>

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
                    {typeof t.evidence?.title === 'string' ? `"${t.evidence.title}"` : `a ${t.content_type}`} ·{' '}
                    {t.sent_at ? new Date(t.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
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
