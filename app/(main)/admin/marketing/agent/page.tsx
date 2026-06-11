import { Check, X, Sparkles, PenLine } from 'lucide-react'
import { listActions } from '@/lib/studio/agent'
import { generateProposals, generateContentDrafts, approveAction, dismissAction } from './actions'
import { AdminTemplate } from '@/components/templates'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

export default async function AgentPage() {
  const [proposed, executed] = await Promise.all([listActions('proposed'), listActions('executed')])

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Agent Console"
      description="The operator proposes actions; you approve. Every approved action runs through the spine (consent + suppression + unsubscribe), so the agent can never bypass the guardrails. The proposer is deterministic for now; a live Claude operator slots in here later."
    >
      <div className="flex flex-wrap gap-2">
        <form action={generateProposals}>
          <Button type="submit">
            <Sparkles className="w-4 h-4" />
            Generate winbacks
          </Button>
        </form>
        <form action={generateContentDrafts}>
          <Button type="submit" variant="secondary">
            <PenLine className="w-4 h-4" />
            Generate content drafts
          </Button>
        </form>
      </div>

      <section>
        <SectionHeader title="Action queue" count={proposed.length} />
        {proposed.length === 0 ? (
          <EmptyState
            title="No proposals."
            description="Generate winbacks or content drafts above to fill the queue."
          />
        ) : (
          <div className="space-y-2 max-w-2xl">
          {proposed.map((a) => {
            const isDraft = a.kind === 'content_draft'
            return (
            <div key={a.id} className="rounded-2xl border border-border bg-surface shadow-sm p-4">
              {isDraft ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-strong">
                    {String(a.payload.channel ?? 'Content')} · {String(a.payload.painPoint ?? '')}
                  </p>
                  <p className="mt-1 text-sm font-bold text-text">{String(a.payload.hook ?? '')}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{String(a.payload.body ?? '')}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-text">
                    {a.kind === 'email_contact' ? 'Email' : a.kind}: {String(a.payload.subject ?? '')}
                  </p>
                  <p className="text-xs text-subtle mt-0.5">to {String(a.payload.email ?? '')}</p>
                </>
              )}
              {a.rationale && <p className="text-xs text-muted mt-1.5">Why: {a.rationale}</p>}
              <div className="flex items-center gap-2 mt-3">
                <form action={approveAction.bind(null, a.id)}>
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg text-success text-xs font-semibold px-3 py-1.5 hover:opacity-80 transition-opacity">
                    <Check className="w-3.5 h-3.5" /> {isDraft ? 'Approve (ready to post)' : 'Approve & send'}
                  </button>
                </form>
                <form action={dismissAction.bind(null, a.id)}>
                  <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-surface-elevated text-muted text-xs font-medium px-3 py-1.5 hover:text-danger transition-colors">
                    <X className="w-3.5 h-3.5" /> Dismiss
                  </button>
                </form>
              </div>
            </div>
            )
          })}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Recently executed" />
        {executed.length === 0 ? (
          <EmptyState title="Nothing executed yet." />
        ) : (
          <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border/60 max-w-2xl">
            {executed.slice(0, 20).map((a) => (
              <div key={a.id} className="px-4 py-2.5 text-sm text-muted">
                {String(a.payload.subject ?? a.kind)} → {String(a.payload.email ?? '')}
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminTemplate>
  )
}
