import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { spaceEmailColors, spaceEmailColorDefaults } from '@/lib/spaces/email-colors'
import { listSpaceEmailDrafts, listSpaceEmailAudienceTags } from '@/lib/spaces/email-drafts'
import { getSpaceEmailStats } from '@/lib/spaces/email-analytics'
import { isSpaceEmailEnabled } from '@/lib/spaces/email'
import { listSpaceSegments } from '@/lib/spaces/segments'
import type { Space } from '@/lib/spaces/types'
import { SpaceMarketingDashboard } from './space-marketing-dashboard'
import { SpaceEmailWorkspace } from './space-email-workspace'
import { EmailStyleEditor } from '@/components/spaces/email/email-style-editor'
import { EmailBody } from '@/app/(main)/spaces/[slug]/settings/email/email-body'
import { QrBody } from '@/app/(main)/spaces/[slug]/settings/qr/qr-body'
import { AutomationBody } from '@/app/(main)/spaces/[slug]/settings/automation/automation-body'
import { MarketingPills, type MarketingPanel } from './marketing-pills'

// THE SPACE MARKETING TAB (owner directive): the space Marketing hub is now the SAME dashboard-led surface
// as the admin CRM Marketing page, with a classifieds-style pill sub-nav across the marketing sub-surfaces
// that swaps IN PLACE with no reload (MarketingPills). The pills mirror the marketing module cards that used
// to sit at the foot of the hub, in catalog order, gated the same way (only a module the console resolved as
// usable becomes a pill). Every email is composed + sent from the draft-first canvas popup on the Email
// panel; the other panels embed the existing, self-gating space surfaces unchanged.
//
// Each panel is a SERVER-rendered slot streamed behind its own Suspense (PAGE-FRAMEWORK §5), so a slow
// surface never blocks the Email panel. The heavy surfaces (QR, automation) re-resolve + re-gate themselves,
// so this composer only wires them in. Voice canon: no em dashes.

/** The label + node builder for each marketing module id. A module not in this map is skipped (defensive). */
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

  // The Email panel's data (dashboard + composer). Resolved once here; the other panels self-fetch.
  const [tags, segments, drafts, stats, emailEnabled] = await Promise.all([
    listSpaceEmailAudienceTags(spaceId),
    listSpaceSegments(spaceId),
    listSpaceEmailDrafts(spaceId),
    getSpaceEmailStats(spaceId),
    isSpaceEmailEnabled(spaceId),
  ])
  const segmentOptions = segments.map((s) => ({ id: s.id, name: s.name }))

  // Build a panel node for one marketing module id.
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
            initialCampaigns={drafts}
            stats={stats}
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

  // Fail-safe: if nothing gated through (should not happen for a manager), fall back to the plain Email
  // surface so the tab is never empty.
  if (panels.length === 0) {
    return <EmailBody slug={slug} />
  }

  return <MarketingPills panels={panels} />
}
