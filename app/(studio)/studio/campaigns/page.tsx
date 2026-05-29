import { listCampaigns } from '@/lib/studio/campaigns'
import { CampaignComposer } from './campaign-composer'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const campaigns = await listCampaigns()

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">Campaigns</h1>
      <p className="text-sm text-muted leading-relaxed max-w-2xl mb-6">
        Broadcast emails to a contact segment. Every send goes through the queue,
        skips unsubscribed and suppressed addresses, and includes a one-click
        unsubscribe.
      </p>

      <div className="mb-8">
        <CampaignComposer />
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-2">Sent</h2>
      {campaigns.length === 0 ? (
        <p className="text-sm text-muted">No campaigns yet.</p>
      ) : (
        <div className="rounded-2xl border border-border bg-surface shadow-sm divide-y divide-border/60 max-w-2xl">
          {campaigns.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text truncate">{c.subject}</p>
                <p className="text-xs text-subtle">{c.segment} · {c.status}</p>
              </div>
              <span className="text-xs text-muted shrink-0">{c.recipientCount} sent</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
