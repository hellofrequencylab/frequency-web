import Link from 'next/link'
import { ArrowUpRight, Send } from 'lucide-react'
import { PageHeading } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { MarketingQuickStats } from '@/components/admin/crm/marketing-quick-stats'
import { spaceEmailColors } from '@/lib/spaces/email-colors'
import {
  listSpaceEmailAudienceTags,
  listSpaceEmailMessagingItems,
} from '@/lib/spaces/email-drafts'
import { getSpaceEmailStats, listSpaceSuppressions } from '@/lib/spaces/email-analytics'
import { isSpaceEmailEnabled } from '@/lib/spaces/email'
import { listSpaceSegments } from '@/lib/spaces/segments'
import { spaceModuleById } from '@/lib/admin/modules/space-modules'
import { panelHrefForModule } from '@/lib/spaces/surface-hrefs'
import type { SpaceEmailStats } from '@/lib/spaces/email-analytics'
import type { MarketingEmailOverview } from '@/lib/email-studio/analytics'
import type { Space } from '@/lib/spaces/types'
import { SpaceMarketingDashboard } from './space-marketing-dashboard'
import { EmailBody } from '@/app/(main)/spaces/[slug]/settings/email/email-body'

// THE SPACE MARKETING TAB (owner directive): the space Marketing hub reads as the SAME page as the admin CRM
// Marketing page, scoped to the space. It leads with the SAME header grammar (PageHeading: eyebrow
// "Community Resonance" + the Send-iconed "Marketing" H1 + description + the pipeline quick stats on the
// right), then the Marketing DASHBOARD as the main body (the SAME three-section body as the admin Marketing
// page: Email performance + Everything you send + Best practices, reusing the admin components unchanged).
// The OTHER marketing tools are link-box CARDS at the bottom, mirroring how the Community/Resonance tab
// surfaces the rest of its CRM as cards (console.tsx, section === 'resonance'): the embed leads, then a
// SectionHeader + a grid of link cards. No pill sub-nav.
//
// This is a Server Component. Voice canon: no em dashes.

const TOOL_LABEL: Record<string, string> = {
  'space.marketing': 'Email design',
  'space.emailstyle': 'Email style',
  'space.reach': 'QR codes',
  'space.insights': 'Scans',
  'space.automation': 'Automation',
}

/** One marketing tool as a tappable link-box CARD into its surface: a small icon tile + the label + a
 *  one-line description + a quiet open affordance. Mirrors the console's feature-card visual (icon tile,
 *  DAWN tokens), with the ArrowUpRight that signals a jump to another surface. */
function MarketingToolCard({ id, href }: { id: string; href: string }) {
  const mod = spaceModuleById(id)
  if (!mod) return null
  const Icon = mod.Icon
  const label = TOOL_LABEL[id] ?? mod.label
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">{label}</span>
          <span className="mt-0.5 block text-xs text-muted">{mod.desc}</span>
        </span>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-strong motion-reduce:transition-none"
          aria-hidden
        />
      </Link>
    </li>
  )
}

/** Build the admin `MarketingEmailOverview` shape from a Space's own deliverability + engagement snapshot.
 *  Delivery (sent / delivered / bounced / complained / suppressed) comes from the Space email ledger
 *  (outreach_sends); opens + clicks come from the Space's self-hosted engagement events (space_email_events,
 *  via getSpaceEmailStats). Unsubscribes come from the Space's own opt-out suppressions. PURE. */
function toOverview(stats: SpaceEmailStats, unsubscribed: number, campaignsSent: number): MarketingEmailOverview {
  const { sent, delivered } = stats
  return {
    sent,
    delivered,
    opened: stats.opened,
    clicked: stats.clicked,
    bounced: stats.bounced,
    complained: stats.complained,
    unsubscribed,
    openRate: stats.openRate,
    clickRate: stats.clickRate,
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

  const [tags, segments, messagingItems, stats, suppressions, emailEnabled] = await Promise.all([
    listSpaceEmailAudienceTags(spaceId),
    listSpaceSegments(spaceId),
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

  // The other marketing tools become link-box cards below the dashboard, in catalog order, minus the Email
  // dashboard (space.comms, that IS the body). Drop any id with no resolvable surface href (defensive).
  const tools = marketingModuleIds
    .filter((id) => id !== 'space.comms' && id in TOOL_LABEL)
    .map((id) => {
      const mod = spaceModuleById(id)
      const href = mod ? panelHrefForModule(mod, slug) : null
      return href ? { id, href } : null
    })
    .filter((t): t is { id: string; href: string } => t !== null)

  const header = (
    <PageHeading
      eyebrow="Community Resonance"
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

  // Fail-safe: if the Marketing (Email) dashboard is not gated through, fall back to the plain Email surface
  // so the tab is never empty.
  if (!marketingModuleIds.includes('space.comms')) {
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
      <div className="space-y-8">
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
        {tools.length > 0 && (
          <div>
            <SectionHeader title="Marketing tools" />
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {tools.map((t) => (
                <MarketingToolCard key={t.id} id={t.id} href={t.href} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
