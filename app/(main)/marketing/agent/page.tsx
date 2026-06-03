import { Check, X, Sparkles, PenLine } from 'lucide-react'
import { listActions } from '@/lib/studio/agent'
import { generateProposals, generateContentDrafts, approveAction, dismissAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AgentPage() {
  const [proposed, executed] = await Promise.all([listActions('proposed'), listActions('executed')])

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Agent Console</h1>
      <p className="text-sm text-muted leading-relaxed max-w-2xl mb-4">
        The operator proposes actions; you approve. Every approved action runs through
        the spine (consent + suppression + unsubscribe), so the agent can never bypass
        the guardrails. The proposer is deterministic for now; a live Claude operator
        slots in here later.
      </p>

      <div className="flex flex-wrap gap-2 mb-8">
        <form action={generateProposals}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold px-4 py-2 shadow-sm transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate winbacks
          </button>
        </form>
        <form action={generateContentDrafts}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface hover:bg-surface-elevated text-text text-sm font-semibold px-4 py-2 shadow-sm transition-colors"
          >
            <PenLine className="w-4 h-4" />
            Generate content drafts
          </button>
        </form>
      </div>

      <h2 className="text-sm font-bold text-text mb-2">
        Action queue ({proposed.length})
      </h2>
      {proposed.length === 0 ? (
        <p className="text-sm text-muted mb-8">No proposals. Generate some above.</p>
      ) : (
        <div className="space-y-2 mb-8 max-w-2xl">
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

      <h2 className="text-sm font-bold text-text mb-2">Recently executed</h2>
      {executed.length === 0 ? (
        <p className="text-sm text-muted">Nothing executed yet.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border/60 max-w-2xl">
          {executed.slice(0, 20).map((a) => (
            <div key={a.id} className="px-4 py-2.5 text-sm text-muted">
              {String(a.payload.subject ?? a.kind)} → {String(a.payload.email ?? '')}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
