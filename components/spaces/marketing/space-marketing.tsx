import { Suspense } from 'react'
import { Send } from 'lucide-react'
import { PageHeading } from '@/components/templates'
import { Skeleton } from '@/components/ui/skeleton'
import { MarketingQuickStats } from '@/components/admin/crm/marketing-quick-stats'
import { spaceEmailColors, spaceEmailColorDefaults } from '@/lib/spaces/email-colors'
import {
  listSpaceEmailDrafts,
  listSpaceEmailAudienceTags,
  listSpaceEmailMessagingItems,
} from '@/lib/spaces/email-drafts'
import { getSpaceEmailStats, listSpaceSuppressions } from '@/lib/spaces/email-analytics'
import { isSpaceEmailEnabled } from '@/lib/spaces/email'
import { listSpaceSegments } from '@/lib/spaces/segments'
import type { SpaceEmailStats } from '@/lib/spaces/email-analytics'
import type { MarketingEmailOverview } from '@/lib/email-studio/analytics'
import type { Space } from '@/lib/spaces/types'
import { SpaceMarketingDashboard } from './space-marketing-dashboard'
import { SpaceEmailWorkspace } from './space-email-workspace'
import { EmailStyleEditor } from '@/components/spaces/email/email-style-editor'
import { EmailBody } from '@/app/(main)/spaces/[slug]/settings/email/email-body'
import { QrBody } from '@/app/(main)/spaces/[slug]/settings/qr/qr-body'
import { AutomationBody } from '@/app/(main)/spaces/[slug]/settings/automation/automation-body'
import { MarketingPills, type MarketingPanel } from './marketing-pills'

// THE SPACE MARKETING TAB (owner directive): the space Marketing hub reads as the SAME page as the admin CRM
// Marketing page, scoped to the space. It leads with the SAME header grammar (PageHeading: eyebrow "Resonance
// CRM" + the Send-iconed "Marketing" H1 + description + the pipeline quick stats on the right), then a
// classifieds-style pill sub-nav across the marketing sub-surfaces that swaps IN PLACE with no reload
// (MarketingPills). The Email pill is the SAME three-section body as the admin Marketing page (Email
// performance + Everything you send + Best practices), reusing the admin components unchanged. The pills are
// the gated marketing modules in catalog order (only what this space + role can use).
//
// Each panel is a SERVER-rendered slot streamed behind its own Suspense (PAGE-FRAMEWORK §5). Voice canon: no
// em dashes.

const PANEL_LABEL: Record<string, string> = {
  'space.comms': 'Email',
  'space.marketing': 'Email design',
  'space.emailstyle': 'Email style',
  'space.reach': 'QR codes',
  'space.insights': 'Scans',
  'space.automation': 'Automation',
}

function panelSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}

/** Build the admin `MarketingEmailOverview` shape from a Space's own deliverability snapshot. The Space email
 *  ledger (outreach_sends) records DELIVERY only (sent / delivered / bounced / complained / suppressed), not
 *  per-send opens or clicks, so those read 0 here (honest: the Space does not track email engagement yet).
 *  Unsubscribes come from the Space's own opt-out suppressions. PURE. */
function toOverview(stats: SpaceEmailStats, unsubscribed: number, campaignsSent: number): MarketingEmailOverview {
  const { sent, delivered } = stats
  return {
    sent,
    delivered,
    opened: 0,
    clicked: 0,
    bounced: stats.bounced,
    complained: stats.complained,
    unsubscribed,
    openRate: 0,
    clickRate: 0,
    bounceRate: stats.bounceRate,
    complaintRate: stats.complaintRate,
    unsubscribeRate: delivered > 0 ? unsubscribed / delivered : 0,
    deliveryRate: sent > 0 ? delivered / sent : 0,
    lastEventAt: null,
    campaignsSent,
  }
}

export async function SpaceMarketing({
  space,
  marketingModuleIds,
  staffViewing,
}: {
  space: Space
  /** The gated marketing module ids, in catalog order (from the console's resolved manifest). */
  marketingModuleIds: string[]
  /** A staff janitor preview: compose / send / style edits render read-only. */
  staffViewing: boolean
}) {
  const spaceId = space.id
  const slug = space.slug
  const readOnly = staffViewing

  const colors = spaceEmailColors(space)
  const brandDefaults = spaceEmailColorDefaults(space)

  const [tags, segments, drafts, messagingItems, stats, suppressions, emailEnabled] = await Promise.all([
    listSpaceEmailAudienceTags(spaceId),
    listSpaceSegments(spaceId),
    listSpaceEmailDrafts(spaceId),
    listSpaceEmailMessagingItems(spaceId),
    getSpaceEmailStats(spaceId),
    listSpaceSuppressions(spaceId, 200),
    isSpaceEmailEnabled(spaceId),
  ])
  const segmentOptions = segments.map((s) => ({ id: s.id, name: s.name }))

  // The pipeline quick stats (admin header) + the deliverability overview, from this Space's own data.
  const counts = {
    campaigns: messagingItems.length,
    funnels: 0,
    live: messagingItems.filter((c) => c.status === 'live').length,
    scheduled: messagingItems.filter((c) => c.status === 'scheduled').length,
    drafts: messagingItems.filter((c) => c.status === 'draft').length,
  }
  const campaignsSent = messagingItems.filter((c) => c.status === 'sent').length
  const unsubscribed = suppressions.filter((s) => !s.isGlobal && (s.reason ?? '').toLowerCase().includes('unsub')).length
  const overview = toOverview(stats, unsubscribed, campaignsSent)

  function nodeFor(id: string): React.ReactNode {
    switch (id) {
      case 'space.comms':
        return (
          <SpaceMarketingDashboard
            spaceId={spaceId}
            slug={slug}
            colors={colors}
            tags={tags}
            segments={segmentOptions}
            campaigns={messagingItems}
            overview={overview}
            emailEnabled={emailEnabled}
            readOnly={readOnly}
          />
        )
      case 'space.marketing':
        return (
          <Suspense fallback={panelSkeleton()}>
            <SpaceEmailWorkspace spaceId={spaceId} initialCampaigns={drafts} colors={colors} />
          </Suspense>
        )
      case 'space.emailstyle':
        return (
          <EmailStyleEditor slug={slug} current={colors} brandDefaults={brandDefaults} readOnly={readOnly} />
        )
      case 'space.reach':
        return (
          <Suspense fallback={panelSkeleton()}>
            <QrBody slug={slug} />
          </Suspense>
        )
      case 'space.insights':
        return (
          <Suspense fallback={panelSkeleton()}>
            <QrBody slug={slug} />
          </Suspense>
        )
      case 'space.automation':
        return (
          <Suspense fallback={panelSkeleton()}>
            <AutomationBody slug={slug} />
          </Suspense>
        )
      default:
        return null
    }
  }

  const panels: MarketingPanel[] = marketingModuleIds
    .filter((id) => id in PANEL_LABEL)
    .map((id) => ({ key: id, label: PANEL_LABEL[id], node: nodeFor(id) }))

  const header = (
    <PageHeading
      eyebrow="Resonance CRM"
      title={
        <span className="inline-flex items-center gap-2">
          <Send className="h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
          Marketing
        </span>
      }
      description="Send branded email to your own contacts: everyone, a saved segment, or a tag. The composer always saves as a draft until you send."
      actions={<MarketingQuickStats counts={counts} overview={overview} />}
      actionsAlign="center"
      adminBar={false}
    />
  )

  // Fail-safe: if nothing gated through (should not happen for a manager), fall back to the plain Email
  // surface so the tab is never empty.
  if (panels.length === 0) {
    return (
      <div>
        {header}
        <EmailBody slug={slug} />
      </div>
    )
  }

  return (
    <div>
      {header}
      <MarketingPills panels={panels} />
    </div>
  )
}
