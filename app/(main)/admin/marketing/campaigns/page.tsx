import { listCampaigns, listSegmentOptions } from '@/lib/studio/campaigns'
import { CampaignComposer } from './campaign-composer'
import { DashboardTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const [campaigns, segmentOptions] = await Promise.all([listCampaigns(), listSegmentOptions()])

  return (
    <DashboardTemplate
      eyebrow="Marketing"
      title="Campaigns"
      description="Broadcast emails to a contact segment. Every send goes through the queue, skips unsubscribed and suppressed addresses, and includes a one-click unsubscribe."
    >
      <CampaignComposer options={segmentOptions} />

      <section>
        <SectionHeader title="Sent" count={campaigns.length} />
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet."
            description="Compose a broadcast above to reach a contact segment."
          />
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
      </section>
    </DashboardTemplate>
  )
}
