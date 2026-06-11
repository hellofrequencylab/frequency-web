import { listCampaigns, listSegmentOptions } from '@/lib/studio/campaigns'
import { CampaignComposer } from './campaign-composer'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { CampaignsTable } from './campaigns-table'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const [campaigns, segmentOptions] = await Promise.all([listCampaigns(), listSegmentOptions()])

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Campaigns"
      description="Broadcast emails to a contact segment. Every send goes through the queue, skips unsubscribed and suppressed addresses, and includes a one-click unsubscribe."
      width="wide"
    >
      <AdminSection title="Compose">
        <CampaignComposer options={segmentOptions} />
      </AdminSection>

      <AdminSection title="Sent" description={`${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}.`}>
        {campaigns.length === 0 ? (
          <EmptyState
            variant="first-use"
            title="No campaigns yet."
            description="Compose a broadcast above to reach a contact segment."
          />
        ) : (
          <CampaignsTable campaigns={campaigns} />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
